'use strict'

const path = require('path')
const map = require('map-stream')
const express = require('express')
const collect = require('stream-collector')
const typeforce = require('typeforce')
const yn = require('yn')
const jsonParser = require('body-parser').json()
const urlParser = require('body-parser').urlencoded({ extended: true })
const Q = require('bluebird-q')
const writeFile = require('write-file-atomic')
const mkdirp = require('mkdirp')
const validURL = require('valid-url')
const tradleUtils = require('@tradle/utils')
const Identity = require('@tradle/identity').Identity
const constants = require('@tradle/constants')
const newHooks = require('./lib/webhooks')
const localOnly = require('./middleware/localOnly')
const env = process.env.NODE_ENV || 'development'
const DEV = env === 'development'
const hooksDir = path.join(process.env.HOME, '.tradle-server')
const hooksPath = path.join(hooksDir, 'hooks.json')
const hooksDbPath = path.join(hooksDir, 'hooks.db')
let hooks
try {
  hooks = require(hooksPath)
} catch (err) {
  mkdirp.sync(hooksDir)
  hooks = {}
}

module.exports = function timServer (opts) {
  typeforce({
    router: typeforce.oneOf('EventEmitter', 'Function'), // express app/router
    tim: 'Object',
    public: '?Boolean'
  }, opts)

  const queue = newHooks({
    path: hooksDbPath,
    maxRetries: 50,
    backoff: {
      randomisationFactor: 0,
      initialDelay: 1000,     // 0s, 1s, 2s, 4s, etc.
      maxDelay: 600000        // 10 mins
    }
  })

  const router = opts.router
  const tim = opts.tim

  if (DEV && router.set) {
    router.set('json replacer', jsonReplacer)
    router.set('json spaces', 2)
  }

  if (!opts.public) router.use(localOnly)

  router.get('/balance', localOnly, function (req, res) {
    Q.ninvoke(tim.wallet, 'balance')
      .then(balance => res.json({balance}))
      .catch(err => sendErr(res, err))
  })

  router.get('/publish-status', localOnly, function (req, res) {
    tim.identityPublishStatus()
      .then(status => res.json({status}))
      .catch(err => sendErr(res, err))
  })

  // router.get('/self-publish', localOnly, function (req, res) {
  //   tim.publishMyIdentity()
  //     .then(() => res.send('Publishing...check back in a bit'))
  //     .catch(err => sendErr(res, err))
  // })

  router.get('/identities', function (req, res) {
    collect(tim.identities().createReadStream(), function (err, results) {
      if (err) return sendErr(res, err)

      res.json(results)
    })
  })

  router.get('/identity/:id', function (req, res) {
    Q.allSettled([
      Q.ninvoke(tim.identities(), 'byFingerprint', req.params.id),
      Q.ninvoke(tim.identities(), 'byRootHash', req.params.id)
    ])
    .then(results => {
      const val = results.reduce((found, next) => found || next.value)
      if (val) {
        res.json(val)
      } else {
        sendErr(res, new Error('not found'), 404)
      }
    })
  })

  router.get('/messages', localOnly, function (req, res) {
    const filter = req.query
    const stream = tim.messages().createValueStream()
      .pipe(map((data, cb) => {
        for (let p in filter) {
          if (data[p] !== filter[p]) return cb()
        }

        cb(null, data)
      }))

    collect(stream, function (err, results) {
      if (err) return sendErr(res, err)

      res.json(results)
    })
  })

  router.get('/message/:curHash', localOnly, function (req, res) {
    tim.messages().byCurHash(req.params.curHash, function (err, result) {
      if (err) return sendErr(res, err)

      return tim.lookupObject(result)
        .then(msg => {
          msg = transformMessages(msg, req.query)
          res.json(msg)
        })
        .catch(err => sendErr(res, err))
        .done()
    })
  })

  router.post('/message', localOnly, jsonParser, function (req, res, next) {
    const body = req.body
    if (!body) {
      return sendErr(res, 'where did you hide the body?', 400)
    }

    if (!('to' in body && 'body' in body)) {
      return sendErr(res, '"to" and "body" are required parameters', 400)
    }

    let to = body.to
    const msg = body.body
    if (!(to && msg && typeof to === 'object' && typeof msg === 'object')) {
      return sendErr(res, '"to" and "body" must be JSON objects', 400)
    }

    if (!Array.isArray(to)) to = [to]
    if (!msg[NONCE]) msg[NONCE] = tradleUtils.newMsgNonce()

    let promise
    try {
      promise = tim.send({
        to: to,
        msg: msg,
        public: yn(req.query.public),
        chain: yn(req.query.chain),
        // default to true
        deliver: yn(req.query.deliver) !== false
      })
    } catch (err) {
      // TODO: may need to sanitize error
      return sendErr(res, err.message, 400)
    }

    promise
      .then(function (entries) {
        // res.send('sending, check back in a bit...')
        res.json(entries[0].toJSON())
      })
      .catch(function (err) {
        err = tradleUtils.httpError(err.code, 'failed to send message: ' + err.message)
        sendErr(res, err)
      })
      .done()
  })

  router.get('/chained', localOnly, function (req, res) {
    const chained = tim
      .messages()
      .createValueStream()
      .pipe(map(function (data, cb) {
        if ('txType' in data &&
          (data.dateChained || data.dateUnchained)) {
          cb(null, data)
        } else {
          cb()
        }
      }))
      .pipe(map(function (data, cb) {
        tim.lookupObject(data)
          .catch(function (err) {
            console.log('failed to lookup', data)
            cb()
          })
          .done(function (obj) {
            cb(null, obj)
          })
      }))

    collect(chained, function (err, results) {
      if (err) return sendErr(res, err)

      transformMessages(results, req.query)
      res.json(results)
    })
  })

  router.post('/hook', localOnly, urlParser, function (req, res, next) {
    updateHooks(req, res)
  })

  router.delete('/hook', localOnly, urlParser, function (req, res, next) {
    // remove
    updateHooks(req, res, true)
  })

  router.use(defaultErrHandler)

  tim.once('ready', function () {
    // tim.on('chained', function (obj) {
    //   console.log('chained', obj)
    // })

    // tim.publishMyIdentity()
    tim.on('error', function (err) {
      console.error(err)
    })
  })

  ;['message', 'chained', 'unchained'].forEach(event => {
    tim.on(event, info => {
      if (!Object.keys(hooks).length) return

      tim.lookupObject(info)
        .then(obj => {
          obj = objToJSON(obj)
          for (var url in hooks) {
            queue.push(url, obj)
          }
        })
    })
  })

  // console.log('Send money to', tim.wallet.addressString)
  // printBalance()
  // setInterval(function () {
  //   printBalance()
  //   printIdentityPublishStatus()
  // }, 60000).unref()

  return function destroy () {
    return Q.all([
      // tim.destroy(), // leave this up to caller
      Q.ninvoke(queue, 'close')
    ])
  }


  // function printBalance () {
  //   tim.wallet.balance(function (err, balance) {
  //     if (err) console.error('failed to get balance', err.message)
  //     else console.log('balance', balance)
  //   })
  // }
}

module.exports.middleware = {
  localOnly: localOnly
}

function safeSendErr (res, err, code) {
  const msg = DEV
    ? getErrorMessage(err) + (err.stack && ('\n' + err.stack))
    : 'something went horribly wrong'

  sendErr(res, msg, code || err.code)
}

function sendErr (res, msg, code) {
  res.status(code || 500).send({
    message: msg
  })
}

function sendCode (res, code) {
  res.status(code).end()
}

function getErrorMessage (err) {
  return typeof err === 'string' ? err : err.message
}

function jsonReplacer (k, v)  {
  if (Array.isArray(v) && v.every(function (i) { return typeof i === 'number' })) {
    return '[' + v.join(',') + ']' // don't prettify
  }

  return v
}

function defaultErrHandler (err, req, res, next) {
  if (err) return safeSendErr(res, err)

  next()
}

function truthy (val) {
  return val === '1' || val === 'true'
}

function transformMessages (msgs, opts) {
  const wasArray = Array.isArray(msgs)
  if (!wasArray) msgs = [msgs]

  if (yn(opts.bodyOnly)) {
    msgs = msgs.map(m => m.parsed)
  }

  return wasArray ? msgs : msgs[0]
}

function objToJSON (obj) {
  obj = tradleUtils.rebuf(clone(obj))
  if (obj.tx) obj.tx = obj.tx.toString('hex')

  for (let p in obj) {
    let val = obj[p]
    if (val == null) continue

    if (p === 'permission' && typeof val.body === 'function') {
      obj[p] = val.body()
    } else if (val instanceof Identity) {
      obj[p] = val.toJSON()
    } else if (val.exportPublic) {
      obj[p] = val.exportPublic()
    } else if (Buffer.isBuffer(val)) {
      obj[p] = val.toString('base64')
    } else if (val && typeof val === 'object') {
      if (val.toJSON) val = val.toJSON()

      obj[p] = objToJSON(val)
    }
  }

  return obj
}

function updateHooks (req, res, remove) {
  const create = !remove
  const url = req.body.url
  if (!url) return sendErr(res, 'expected "url" parameter', 400)
  if (!validURL.isUri(url)) return sendErr(res, 'invalid "url" parameter', 400)

  // we're already good
  if (!!hooks[url] === create) return sendCode(res, 200)

  let code
  try {
    if (create) hooks[url] = true
    else delete hooks[url]

    writeFile.sync(hooksPath, hooks)
    code = 200
  } catch (err) {
    code = 500
    console.error(err)

    // revert change (in-memory)
    if (remove) hooks[url] = true
    else delete hooks[url]
  }

  sendCode(res, code)
}
