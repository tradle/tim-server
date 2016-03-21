
const path = require('path')
const typeforce = require('typeforce')
const extend = require('xtend')
const leveldown = require('leveldown')
const levelup = require('levelup')
const Driver = require('tim')
const DHT = require('@tradle/bittorrent-dht')
const Identity = require('@tradle/identity').Identity
const Blockchain = require('@tradle/cb-blockr')
const Keeper = require('@tradle/http-keeper')
const networkName = 'testnet'

module.exports = function buildTim (opts) {
  typeforce({
    identity: 'Object',
    keys: 'Array',
    afterBlockTimestamp: '?Number'
  }, opts)

  const iJSON = opts.identity

  opts = extend(opts)
  if (!opts.keeper) {
    opts.keeper = new Keeper({
      db: levelup(path.resolve(process.cwd(), 'storage'), { db: leveldown, valueEncoding: 'binary' }),
      fallbacks: ['http://tradle.io:25667']
    })
  }

  if (!opts.blockchain) {
    opts.blockchain = new Blockchain(opts.networkName)
  }

  return new Driver(extend({
    networkName: networkName,
    leveldown: leveldown,
    syncInterval: 600000
  }, opts))
}
