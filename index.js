var once = require('once')
var map = require('map-stream')
var express = require('express')
var collect = require('stream-collector')
var typeforce = require('typeforce')
var Q = require('q')
var Identity = require('midentity').Identity
var constants = require('tradle-constants')
var env = process.env.NODE_ENV || 'development'
var DEV = env === 'development'

module.exports = function timServer (opts) {
  typeforce({
    app: 'EventEmitter',
    tim: 'Object',
    public: '?Boolean'
  }, opts)

  var app = opts.app
  var tim = opts.tim

  if (DEV) {
    app.set('json replacer', jsonReplacer)
    app.set('json spaces', 2)
  }

  if (!opts.public) {
    app.use(function(req, res, next) {
      if (/https?:\/\/(localhost|127.0.0.1):/.test(req.ip)) {
        next()
      } else {
        res.end(403, 'forbidden')
      }
    })
  }

  app.get('/balance', function (req, res) {
    Q.ninvoke(tim.wallet, 'balance')
      .then(function (balance) {
        res.send('' + balance)
      })
      .catch(function (err) {
        sendErr(res, err)
      })
  })

  app.get('/publish-status', function (req, res) {
    tim.identityPublishStatus()
      .then(function (status) {
        res.send(status)
      })
      .catch(function (err) {
        sendErr(res, err)
      })
  })

  app.get('/self-publish', function (req, res) {
    tim.publishMyIdentity()
      .then(function () {
        res.send('Publishing...check back in a bit')
      })
      .catch(function (err) {
        sendErr(res, err)
      })
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
    tim.messages().byRootHash(req.params.rootHash, function (err, results) {
      if (err) return sendErr(res, err)

      res.json(results)
    })
  })

  app.get('/decrypted/:rootHash', function (req, res) {
    return Q.ninvoke(tim.messages(), 'byRootHash', req.params.rootHash)
      .then(function (results) {
        return Q.all(results.map(function (r) {
          return tim.lookupObject(r)
        }))
      })
      .then(function (decrypted) {
        res.json(decrypted)
      })
      .catch(function (err) {
        sendErr(res, err)
      })
      .done()
  })

  app.get('/curHash/:curHash', function (req, res) {
    tim.messages().byCurHash(req.params.curHash, function (err, result) {
      if (err) return sendErr(res, err)

      return tim.lookupObject(result)
        .then(function (decrypted) {
          res.json(decrypted)
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

  // app.get('/publish', function (req, res) {
  // })

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
        chain: truthy(req.query.chain),
        deliver: truthy(req.query.deliver)
      })
    } catch (err) {
      return res.status(400).send(err.message)
    }

    promise
      .then(function (entries) {
        // res.send('sending, check back in a bit...')
        res.json(entries.map(function (e) {
          return e.toJSON()
        }))
      })
      .catch(function (err) {
        err.message = 'failed to send message: ' + err.message
        sendErr(res, err)
      })
      .done()
  })

  app.use(defaultErrHandler)

  tim.once('ready', function () {
    // tim.on('chained', function (obj) {
    //   console.log('chained', obj)
    // })

    // tim.publishMyIdentity()
    tim.on('error', function (err) {
      console.error(err)
    })
  })

  // console.log('Send money to', tim.wallet.addressString)
  // printBalance()
  // setInterval(function () {
  //   printBalance()
  //   printIdentityPublishStatus()
  // }, 60000).unref()

  return tim.destroy.bind(tim)

  // function printBalance () {
  //   tim.wallet.balance(function (err, balance) {
  //     if (err) console.error('failed to get balance', err.message)
  //     else console.log('balance', balance)
  //   })
  // }
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
