'use strict'

const test = require('tape')
const request = require('supertest')
const leveldown = require('memdown')
const levelup = require('levelup')
const users = require('./fixtures/users')
let dbCounter = 0

function nextDBName () {
  return 'db' + (dbCounter++)
}

// function nextFeed () {
//   return changesFeed(helpers.nextDB())
// }

function nextDB (opts) {
  opts = opts || {}
  if (!opts.leveldown) opts.db = leveldown
  return levelup(nextDBName(), opts)
}

function createKeeper () {
  return nextDB()
}

test('api', function (t) {
  const user = users[0]
  // const node = new tradle.node({
  //   dir: './blah',
  //   networkName: 'testnet',
  //   keys: user.priv,
  //   identity: user.pub,
  //   keeper: createKeeper(),
  //   leveldown: leveldown,
  //   transactor: function (to, cb) {
  //     cb(new Error('blah'))
  //   }
  // })

  const mockNode = {
    send: function () {

    },
    signNSend: function () {

    },
    addressBook: {
      createReadStream: function () {
        var r = new Readable()
        r._read = function () {}
        r.push(users[0], users[1])
        return r
      }
    }
  }

  const app = express()
  const server = createServer({ router: app, node: node })
  request(app)
    .get('/identities')
})
