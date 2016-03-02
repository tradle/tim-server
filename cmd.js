#!/usr/bin/env node

var express = require('express')
var buildTim = require('./lib/buildTim')
var argv = require('minimist')(process.argv.slice(2), {
  alias: {
    p: 'port',
    t: 'tim-port',
    i: 'identity',
    k: 'keys',
    h: 'help'
  },
  default: {
    p: 33333,
    t: 44444
  }
})

if (argv.help) {
  printHelp()
}

if (!argv.identity) {
  console.error('ERROR: --identity is required, see usage')
  printHelp()
  process.exit(1)
}

if (!argv.keys) {
  console.error('ERROR: --keys is required, see usage')
  printHelp()
  process.exit(1)
}

var app = express()
var port = argv.port
var server = app.listen(port)
server.on('error', function (err) {
  if (err) {
    console.error('ERROR', err.message)
    process.exit(1)
  }
})

// hacky, but express needs to run with net, not utp
require('@tradle/multiplex-utp')

var debug = require('debug')('tim-server')
var path = require('path')
var assert = require('assert')
var setupApp = require('./')

var Identity = require('@tradle/identity').Identity
var identityJSON = require(path.resolve(argv.identity))
var keys = require(path.resolve(argv.keys))
var timPort = argv['tim-port']

var tim = buildTim({
  identity: identityJSON,
  keys: keys,
  port: timPort,
  afterBlockTimestamp: 1445884939
})

var destroy = setupApp({
  router: app,
  tim: tim
})

console.log('Tim is running on port:', timPort)
console.log('Server is Running on port:', port)
printIdentityPublishStatus()
tim.wallet.balance(function (err, balance) {
  console.log('Balance: ', balance)
  console.log('Send coins to: ', tim.wallet.addressString)
})

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

function printIdentityPublishStatus () {
  tim.identityPublishStatus()
    .then(function (status) {
      var msg = 'identity status: '
      if (status.current) msg += 'published latest'
      else if (status.queued) msg += 'queued for publishing'
      else if (!status.ever) msg += 'unpublished'
      else msg += 'published, needs republish'

      console.log(msg)
    })
    .catch(function (err) {
      console.error('failed to get identity status', err.message)
    })
}

function printHelp () {
  console.log(function () {
  /*
  WORK IN PROGRESS, DON'T USE IN A PRODUCTION ENVIRONMENT

  Usage:
      tim-server <options>

  Example:
      tim-server -i ./identity.json -k ./keys.json

  Options:
      -h, --help              print usage
      -i, --identity [path]   path to identity JSON
      -k, --keys [path]       path to private keys file (for identity)
      -p, --port [number]     server port (default: 33333)
      -t, --tim-port [number] port tim will run on (default: 44444)

  Please report bugs!  https://github.com/mvayngrib/tim-server/issues
  */
  }.toString().split(/\n/).slice(2, -2).join('\n'))
  process.exit(0)
}
