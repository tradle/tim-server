#!/usr/bin/env node

var argv = require('minimist')(process.argv.slice(2), {
  alias: {
    p: 'port',
    t: 'tim-port',
    i: 'identity',
    k: 'keys',
    h: 'help'
  },
  default: {
    p: 32123,
    t: 51086
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

var express = require('express')
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
console.log('Server is Running on port:', port)

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
      -p, --port [number]     server port (default: 32123)
      -t, --tim-port [number] port tim will run on (default: 51086)

  Please report bugs!  https://github.com/mvayngrib/tim-server/issues
  */
  }.toString().split(/\n/).slice(2, -2).join('\n'))
  process.exit(0)
}