#!/usr/bin/env node

'use strict'

const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    n: 'networkName',
    i: 'identity',
    k: 'keys',
    h: 'help'
  },
  default: {
    n: 'testnet',
    i: './identity.json',
    k: './keys'
  }
})

if (argv.help) {
  printHelp()
}

const path = require('path')
const prompt = require('prompt')
const writeFile = require('write-file-atomic')
const tradle = require('@tradle/engine')
const utils = require('./lib/utils')
const networkName = argv.networkName

prompt.get(['password'], function (err, result) {
  if (err) throw err

  const password = result.password
  tradle.utils.newIdentity({ networkName }, function (err, result) {
    if (err) throw err

    const keys = utils.encrypt(JSON.stringify(result.keys), password)
    writeFile.sync(path.resolve(argv.identity), JSON.stringify(result.identity))
    writeFile.sync(path.resolve(argv.keys), keys)
  })
})

function printHelp () {
  console.log(`
  Example:
      ./gen -i ./identity.json -k ./keys

  Options:
      -h, --help              print usage
      -i, --identity [path]   path where to write identity JSON
      -k, --keys [path]       path where to write private keys file (for identity)

  Please report bugs!  https://github.com/tradle/server/issues
  `)
  process.exit(0)
}
