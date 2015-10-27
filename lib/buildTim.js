
var path = require('path')
var crypto = require('crypto')
var typeforce = require('typeforce')
var find = require('array-find')
var DHT = require('bittorrent-dht')
var leveldown = require('leveldown')
// var utils = require('tradle-utils')
var Driver = require('tim')
var Identity = require('midentity').Identity
// var tedPriv = require('chained-chat/test/fixtures/ted-priv')
// var Fakechain = require('blockloader/fakechain')
var Blockchain = require('cb-blockr')
// var Keeper = require('bitkeeper-js')
var Keeper = require('http-keeper')
// var Wallet = require('simple-wallet')
// var fakeKeeper = help.fakeKeeper
// var fakeWallet = help.fakeWallet
// var ted = Identity.fromJSON(tedPriv)
// var billPriv = require('./fixtures/bill-priv')
// var billPub = require('./fixtures/bill-pub.json')
var networkName = 'testnet'
// var BILL_PORT = 51086
// var keeper = fakeKeeper.empty()
var DHT_BOOTSTRAP_NODES = [
  '127.0.0.1:12345'
]

module.exports = function buildTim (opts) {
  typeforce({
    identity: 'Object',
    keys: 'Array',
    port: 'Number',
    afterBlockTimestamp: '?Number'
  }, opts)

  var port = opts.port
  var iJSON = opts.identity
  var identity = Identity.fromJSON(iJSON)
  var dht = dhtFor(iJSON, port)

  var keeper = new Keeper({
    storage: path.resolve(process.cwd(), 'storage'),
    fallbacks: ['http://tradle.io:25667']
    // dht: dht,
    // checkReplication: 5000
  })

  var blockchain = new Blockchain(networkName)

  return new Driver({
    pathPrefix: iJSON.name.firstName.toLowerCase(),
    networkName: networkName,
    keeper: keeper,
    blockchain: blockchain,
    leveldown: leveldown,
    identity: identity,
    identityKeys: opts.keys,
    dht: dht,
    port: port,
    syncInterval: 60000,
    afterBlockTimestamp: opts.afterBlockTimestamp
  })

}

function dhtFor (identity, port) {
  var dht = new DHT({
    nodeId: nodeIdFor(identity, port),
    bootstrap: DHT_BOOTSTRAP_NODES
    // bootstrap: ['tradle.io:25778']
  })

  dht.listen(port)
  return dht
}

function nodeIdFor (identity, port) {
  return crypto.createHash('sha256')
    .update(findKey(identity.pubkeys, { type: 'dsa' }).fingerprint)
    .update(String(port))
    .digest()
    .slice(0, 20)
}

function findKey (keys, where) {
  return find(keys, function (k) {
    for (var p in where) {
      if (k[p] !== where[p]) return false
    }

    return true
  })
}

// function fakeWalletFor (identity) {
//   return fakeWallet({
//     blockchain: blockchain,
//     unspents: [100000, 100000, 100000, 100000],
//     priv: identity.keys({
//       type: 'bitcoin',
//       networkName: networkName
//     })[0].priv()
//   })
// }
