'use strict'

const typeforce = require('typeforce')
const levelup = require('levelup')
const leveldown = require('leveldown')
const newQueue = require('level-jobs')
const request = require('request')
const extend = require('xtend')
const DEFAULT_OPTS = {
  maxConcurrency: Infinity,
  maxRetries: 50,
  backoff: {
    randomisationFactor: 0,
    initialDelay: 1000,
    maxDelay: 600000 // 10 mins
  }
}

module.exports = function (opts) {
  typeforce({
    path: 'String'
  }, opts)

  opts = extend(DEFAULT_OPTS, opts)
  const db = levelup(opts.path, { db: leveldown })

  delete opts.path
  const queue = newQueue(db, doPost, opts)
  let closed

  return {
    __db: db, // for tests
    push: function (url, data) {
      typeforce('String', url)
      typeforce('Object', data)

      if (closed) throw new Error('we\'re closed')

      queue.push({
        url: url,
        data: data
      })
    },
    close: function (cb) {
      if (closed) return

      closed = true
      db.close(cb)
    }
  }
}

function doPost (opts, cb) {
  const url = opts.url
  const body = {
    data: opts.data
  }

  request.post(
    url,
    body,
    function (err, res, body) {
      if (err || res.statusCode !== 200) {
        err = err || new Error(`failed to call webhook at ${url}: ${err || body}`)
        cb(err)
      } else {
        cb(body)
      }
    }
  )
}
