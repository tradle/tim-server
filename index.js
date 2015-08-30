var once = require('once')
var map = require('map-stream')
var express = require('express')
var collect = require('stream-collector')
var typeforce = require('typeforce')
var Q = require('q')
var Identity = require('midentity').Identity
var constants = require('tradle-constants')
var buildTim = require('./lib/buildTim')
var env = process.env.NODE_ENV || 'development'
var DEV = env === 'development'

module.exports = function timServer (opts) {
  typeforce({
    identity: 'Object',
    keys: 'Array',
    port: 'Number',
    app: 'EventEmitter'
  }, opts)

  var app = opts.app
  var keys = opts.keys
  var tim = buildTim(opts)

  if (DEV) {
    app.set('json replacer', jsonReplacer)
    app.set('json spaces', 2)
  }

  app.get('/me', function (req, res) {
    tim.identityPublishStatus(function (err, status) {
      if (err) return sendErr(res, err)

      res.send(status)
    })
  })

  app.get('/self-publish', function (req, res) {
    tim.publishMyIdentity()
    res.send('Publishing...check back in a bit')
  })

  app.get('/identities', function (req, res) {
    collect(tim.identities().createReadStream(), function (err, results) {
      if (err) return sendErr(res, err)

      res.json(results)
    })
  })

  app.get('/identity/:id', function (req, res) {
    var tryAgain = true
    tim.identities().byFingerprint(req.params.id, onResult)
    tim.identities().byRootHash(req.params.id, onResult)
    var respond = once(function (code, contents) {
      res.status(code).json(contents)
    })

    function onResult (err, result) {
      if (err) {
        if (!tryAgain) respond(404, 'nada')
      } else {
        respond(200, result)
      }

      tryAgain = false
    }
  })

  app.get('/messages', function (req, res) {
    collect(tim.messages().createValueStream(), function (err, results) {
      if (err) return sendErr(res, err)

      res.json(results)
    })
  })

  app.get('/obj/:rootHash', function (req, res) {
    var query = {}
    query[constants.ROOT_HASH] = req.params.rootHash
    collect(tim.messages().query(query), function (err, results) {
      if (err) return sendErr(res, err)

      res.json(results)
    })
  })

  app.get('/decrypted/:rootHash', function (req, res) {
    var query = {}
    query[constants.ROOT_HASH] = req.params.rootHash
    collect(tim.messages().query(query), function (err, results) {
      if (err) return sendErr(res, err)

      Q.all(results.map(function (r) {
          return tim.lookupObject(r)
        }))
        .then(function () {
          res.json(results)
        })
        .catch(function (err) {
          sendErr(res, err)
        })
        .done()
    })
  })

  app.get('/chained', function (req, res) {
    var chained = tim
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

      if (req.query.bodyOnly === 'y') {
        results = results.map(function (r) {
          return r.parsed
        })
      }

      res.json(results)
    })
  })

  app.get('/send', function (req, res) {
    if (!('to' in req.query && 'msg' in req.query)) {
      return res.status(400).send('"to" and "msg" are required parameters')
    }

    var to = req.query.to
    var msg = req.query.msg
    var promise
    try {
      msg = JSON.parse(msg)
      to = JSON.parse(to)
      if (!Array.isArray(to)) {
        to = [to]
      }

      promise = tim.send({
        to: to,
        msg: msg,
        public: truthy(req.query.public),
        chain: truthy(req.query.chain)
      })
    } catch (err) {
      return res.status(400).send(err.message)
    }

    promise
      .then(function () {
        res.send('sending, check back in a bit...')
      })
      .catch(function (err) {
        err.message = 'failed to send message: ' + err.message
        sendErr(res, err)
      })
      .done()
  })

  app.use(defaultErrHandler)

  tim.once('ready', function () {
    tim.identityPublishStatus(function (err, status) {
      if (err) return console.error('failed to get identity status', err.message)

      var msg = 'identity status: '
      if (!status.ever) msg += 'unpublished'
      else if (!status.current) msg += 'needs republishing'
      else msg += 'published latest'

      console.log(msg)
    })

    tim.on('chained', function (obj) {
      console.log('chained', obj)
    })

    // tim.publishMyIdentity()
    tim.on('error', function (err) {
      console.error(err)
    })
  })

  console.log('Send money to', tim.wallet.addressString)
  printBalance()
  setInterval(printBalance, 60000).unref()
  return tim.destroy.bind(tim)

  function printBalance () {
    tim.wallet.balance(function (err, balance) {
      if (err) console.error('failed to get balance', err.message)
      else console.log('balance', balance)
    })
  }
}

function sendErr (res, err) {
  var msg = DEV ? err.message : 'something went horribly wrong'
  res.status(500).send(err.message + '\n' + err.stack)
}

function jsonReplacer (k, v)  {
  if (Array.isArray(v) && v.every(function (i) { return typeof i === 'number' })) {
    return '[' + v.join(',') + ']' // don't prettify
  }

  return v
}

function defaultErrHandler (err, req, res, next) {
  if (err) return sendErr(res, err)

  next()
}

function truthy (val) {
  return val === '1' || val === 'true'
}
