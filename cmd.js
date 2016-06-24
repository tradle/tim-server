#!/usr/bin/env node

'use strict'

const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    p: 'port',
    d: 'datadir',
    i: 'identity',
    k: 'keys',
    b: 'blockchain',
    n: 'networkName',
    h: 'help'
  },
  default: {
    port: 33333,
    networkName: 'testnet'
  }
})

if (argv.help) {
  printHelp()
}

;['identity', 'keys', 'datadir'].forEach(arg => {
  if (!argv[arg]) {
    console.error(`ERROR: --${arg} is required, see usage`)
    printHelp()
    process.exit(1)
  }
})

// ^ validate args first = fail faster

const path = require('path')
const fs = require('fs')
const assert = require('assert')
const debug = require('debug')('tradle:server')
const express = require('express')
const leveldown = require('leveldown')
const mkdirp = require('mkdirp')
const prompt = require('prompt')
const blockchainURL = argv.blockchain
let Blockr = !blockchainURL && require('@tradle/cb-blockr')
let Blockchain = blockchainURL && require('cb-http-client')
const createKeeper = require('@tradle/keeper')
const tradle = require('@tradle/engine')
const utils = require('./lib/utils')

process.on('exit', cleanup)
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('uncaughtException', function (err) {
  console.log('Uncaught exception, caught in process catch-all: ' + err.message)
  console.log(err.stack)
})

const stop = start()
let selfDestructing

function start () {
  prompt.get(['password'], function (err, result) {
    if (err) throw err

    const password = result.password
    let keys = fs.readFileSync(path.resolve(argv.keys))
    try {
      keys = utils.decrypt(keys, password)
    } catch (err) {
      console.error('Wrong. Try again.')
      return start()
    }

    keys = JSON.parse(keys)
    doStart({ keys, password })
  })
}

function doStart (opts) {
  const keys = opts.keys
  const app = express()
  const port = argv.port
  const server = app.listen(port)
  server.on('error', function (err) {
    if (err) {
      console.error('ERROR', err.message)
      process.exit(1)
    }
  })

  const createServer = require('./')
  const datadir = argv.datadir
  mkdirp.sync(datadir)

  const identityPath = path.resolve(argv.identity)
  const identityJSON = require(identityPath)
  const networkName = argv.networkName
  const node = new tradle.node({
    dir: datadir,
    identity: identityJSON,
    keys: keys,
    keeper: createKeeper({
      path: path.resolve(datadir, 'keeper'),
      encryption: {
        // TODO: take input
        password: opts.password
      },
      db: leveldown
    }),
    transactor: {
      send: function (to, cb) {
        throw new Error('not implemented yet')
      }
    },
    leveldown: leveldown,
    networkName: networkName,
    blockchain: blockchainURL ? new Blockchain(argv.blockchain) : new Blockr(networkName)
    // afterBlockTimestamp: 1445884939
  })

  createServer({
    router: app,
    node: node
  })

  console.log('Server is Running on port:', port)
  return cb => server.close(cb)
}

function cleanup () {
  if (selfDestructing) return

  selfDestructing = true
  debug('cleaning up before shut down...')
  if (!stop) return process.exit(0)

  try {
    stop(err => {
      console.error('cleanup failed')
      debug('shutting down')
      process.exit(1)
    })
  } catch (err) {
    console.error('cleanup failed, exiting in 5 seconds')
    return setTimeout(() => {
      process.exit(1)
    }, 5000)
  }
}

function printHelp () {
  console.log(`
  WORK IN PROGRESS, DON'T USE IN A PRODUCTION ENVIRONMENT

  Usage:
      tradle-server <options>

  Example:
      tradle-server -i ./identity.json -k ./keys -d ./data

  Options:
      -h, --help              print usage
      -i, --identity [path]   path to identity JSON
      -k, --keys [path]       path to private keys file (for identity)
      -d, --datadir [path]    path to directory where this node's data should be stored
      -p, --port [number]     server port (default: 33333)
      -b, --blockchain        local common-blockchain-compliant full node url

  Please report bugs!  https://github.com/tradle/server/issues
  `)
  process.exit(0)
}
