#!/usr/bin/env node

var argv = require('minimist')(process.argv.slice(2), {
  alias: {
    p: 'port',
    t: 'tim-port',
    i: 'identity',
    k: 'keys'
  },
  default: {
    p: 32123,
    t: 51086
  }
})

var express = require('express')
var app = express()
var port = argv.port
var server = app.listen(port)
// hacky, but express needs to run with net, not utp
require('multiplex-utp')

var debug = require('debug')('tim-server')
var path = require('path')
var assert = require('assert')
var setupApp = require('./')

var Identity = require('midentity').Identity
var identityJSON = require(path.resolve(argv.identity))
var keys = require(path.resolve(argv.keys))
var timPort = argv['tim-port']

var destroy = setupApp({
  app: app,
  identity: identityJSON,
  keys: keys,
  port: timPort
})

console.log('Tim is running on port:', timPort)
console.log('Running on port:', port)

var selfDestructing
process.on('exit', cleanup)
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('uncaughtException', function (err) {
  console.log('Uncaught exception, caught in process catch-all: ' + err.message)
  console.log(err.stack)
})

function cleanup () {
  if (selfDestructing) return

  selfDestructing = true
  debug('cleaning up before shut down...')
  try {
    server.close()
  } catch (err) {}

  destroy()
    .done(function () {
      debug('shutting down')
      process.exit()
    })
}
