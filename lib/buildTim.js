
var path = require('path')
var crypto = require('crypto')
var typeforce = require('typeforce')
var find = require('array-find')
var extend = require('xtend')
var leveldown = require('leveldown')
var levelup = require('levelup')
var Driver = require('tim')
var DHT = require('@tradle/bittorrent-dht')
var Identity = require('@tradle/identity').Identity
var Blockchain = require('@tradle/cb-blockr')
var Keeper = require('@tradle/http-keeper')
var networkName = 'testnet'

module.exports = function buildTim (opts) {
  typeforce({
    identity: 'Object',
    keys: 'Array',
    afterBlockTimestamp: '?Number'
  }, opts)

  var iJSON = opts.identity

  var keeper = new Keeper({
    db: levelup(path.resolve(process.cwd(), 'storage'), { db: leveldown, valueEncoding: 'binary' }),
    fallbacks: ['http://tradle.io:25667']
  })

  var blockchain = new Blockchain(networkName)
  return new Driver(extend({
    networkName: networkName,
    keeper: keeper,
    blockchain: blockchain,
    leveldown: leveldown,
    syncInterval: 600000,
    afterBlockTimestamp: opts.afterBlockTimestamp
  }, opts))
}
