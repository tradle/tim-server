var once = require('once')
var map = require('map-stream')
var express = require('express')
var collect = require('stream-collector')
var typeforce = require('typeforce')
var Identity = require('midentity').Identity
var buildTim = require('./lib/buildTim')

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

      res.send(prettify(results))
    })
  })

  app.get('/identity/:id', function (req, res) {
    var tryAgain = true
    tim.identities().byFingerprint(req.params.id, onResult)
    tim.identities().byRootHash(req.params.id, onResult)
    var respond = once(function (code, contents) {
      res.status(code).send(contents)
    })

    function onResult (err, result) {
      if (err) {
        if (!tryAgain) respond(404, 'nada')
      } else {
        respond(200, prettify(result))
      }

      tryAgain = false
    }
  })

  // app.get('/messages', function (req, res) {
  //   collect(tim.messages().createValueStream(), function (err, results) {
  //     if (err) return sendErr(res, err)

  //     res.send(prettify(results))
  //   })
  // })

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

    collect(chained, function (err, results) {
      if (err) return sendErr(res, err)

      res.send(prettify(results))
    })
  })

  app.get('/send', function (req, res) {
    var promise
    try {
      req.query.msg = JSON.parse(req.query.msg)
      promise = tim.send(req.query)
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
  var msg = process.env.DEV ? err.message : 'something went horribly wrong'
  res.status(500).send(err.message + '\n' + err.stack)
}

function prettify (json) {
  return JSON.stringify(json, function (k, v)  {
    if (Array.isArray(v) && v.every(function (i) { return typeof i === 'number' })) {
      return v.join(',') // don't prettify
    }

    return v
  }, 2)
}

function defaultErrHandler (err, req, res, next) {
  if (err) return sendErr(res, err)

  next()
}