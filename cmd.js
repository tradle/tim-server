#!/usr/bin/env node

var express = require('express')
var argv = require('minimist')(process.argv.slice(2), {
  alias: {
    p: 'port',
    i: 'identity',
    k: 'keys',
    h: 'help'
  },
  default: {
    p: 33333
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
// need this for zlorp (OTR chat over udp)
// require('@tradle/multiplex-utp')

var path = require('path')
var assert = require('assert')
var debug = require('debug')('tim-server')
var Identity = require('@tradle/identity').Identity
var createServer = require('./')
var buildTim = require('./lib/buildTim')

var identityPath = path.resolve(argv.identity)
var identityJSON = require(identityPath)
var keys = require(path.resolve(argv.keys))
var timPort = argv['tim-port']

var tim = buildTim({
  pathPrefix: path.dirname(identityPath),
  identity: Identity.fromJSON(identityJSON),
  keys: keys,
  port: timPort,
  afterBlockTimestamp: 1445884939
})

var teardown = createServer({
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
process.on('exit', teardown)
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

  teardown()
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
  console.log(`
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

  Please report bugs!  https://github.com/mvayngrib/tim-server/issues
  `)
  process.exit(0)
}
