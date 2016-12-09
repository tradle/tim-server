'use strict'

const path = require('path')
// const through = require('through2')
const collect = require('stream-collector')
const typeforce = require('typeforce')
const yn = require('yn')
const jsonParser = require('body-parser').json()
const urlParser = require('body-parser').urlencoded({ extended: true })
// const constants = require('@tradle/protocol').constants
const localOnly = require('./middleware/localOnly')
const env = process.env.NODE_ENV || 'development'
const DEV = env === 'development'

module.exports = function createServer (opts) {
  typeforce({
    router: typeforce.oneOf('EventEmitter', 'Function'), // express app/router
    node: 'Object',
    public: '?Boolean'
  }, opts)

  const node = opts.node
  node.on('error', function (err) {
    console.error(err)
  })

  const router = opts.router
  if (DEV && router.set) {
    router.set('json replacer', jsonReplacer)
    router.set('json spaces', 2)
  }

  if (!opts.public) router.use(localOnly)

  router.get('/balance', localOnly, function (req, res) {
    Q.ninvoke(node.wallet, 'balance')
      .then(balance => res.json({ balance }))
      .catch(err => sendErr(res, err))
  })

  router.get('/identity', function (req, res) {
    res.json(node.identity)
  })

  router.get('/identities', function (req, res) {
    collect(node.addressBook.createReadStream(), function (err, results) {
      if (err) return sendErr(res, err)

      res.json(results)
    })
  })

  router.get('/identity/:identifier', function (req, res) {
    node.addressBook.lookupIdentity(req.params.identifier, function (err, val) {
      if (err) return sendErr(res, new Error('not found'), 404)

      res.json(val)
    })
  })

  router.get('/messages', localOnly, function (req, res) {
    const filter = req.query
    const stream = node.objects.messages()
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

  router.get('/object/:link', localOnly, function (req, res) {
    node.objects.get(req.params.link, function (err, result) {
      if (err) return sendErr(res, new Error('not found'), 404)

      res.json(val)
    })
  })

  router.get('/sealed', localOnly, function (req, res) {
    const sealed = node.objects.sealed({ keys: false })
    collect(sealed, function (err, results) {
      if (err) return sendErr(res, err)

      // transformMessages(results, req.query)
      res.json(results)
    })
  })

  // ;['message', 'wroteseal', 'readseal'].forEach(event => {
  //   node.on(event, info => {
  //     if (!Object.keys(hooks).length) return

  //     node.lookupObject(info)
  //       .then(obj => {
  //         obj = objToJSON(obj)
  //         for (var url in hooks) {
  //           queue.push(url, obj)
  //         }
  //       })
  //   })
  // })

  // console.log('Send money to', node.wallet.addressString)
  // printBalance()
  // setInterval(function () {
  //   printBalance()
  //   printIdentityPublishStatus()
  // }, 60000).unref()

  // WRITE

  router.post('/message', localOnly, jsonParser, function (req, res, next) {
    const body = req.body
    if (!body) {
      return sendErr(res, 'where did you hide the body?', 400)
    }

    try {
      typeforce({
        to: typeforce.String,
        object: typeforce.Object
      }, body)
    } catch (err) {
      return sendErr(res, 'invalid POST data. Expected string "to" and object "object"', 400)
    }

    try {
      node.signAndSend({
        to: { permalink: body.to },
        object: body.object
      }, function (err, result) {
        if (err) return sendErr(res, err)

        res.json(result)
      })
    } catch (err) {
      // TODO: may need to sanitize error
      return sendErr(res, err.message, 400)
    }
  })

  router.post('/seal/:link', localOnly, function (req, res) {
    const link = req.params.link
    node.seal({ link }, function (err, result) {
      if (err.type === 'exists') return sendErr(res, err, 409)
      if (err) return sendErr(res, err)

      res.json(result)
    })
  })

  router.use(defaultErrHandler)

  // function printBalance () {
  //   node.wallet.balance(function (err, balance) {
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
