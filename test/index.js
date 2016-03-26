'use strict'

const test = require('tape')
const rimraf = require('rimraf')
const http = require('http')
const webhooks = require('../lib/webhooks')

test('webhooks', function (t) {
  const port = 32320
  const webhooksDBPath = './hooks.db'
  rimraf.sync(webhooksDBPath)

  const opts = {
    path: webhooksDBPath,
    backoff: {
      initialDelay: 100
    }
  }

  let tries = 5
  const server = http.createServer(function (req, res) {
    tries--
    if (tries < 0) throw new Error('job performed twice')

    const status = tries === 0 ? 200 : 400
    if (tries === 0) {
      t.equal(req.method, 'POST')
      t.pass('webhook called, waiting...')
      setTimeout(function () {
        queue.__db.createReadStream()
          .on('data', t.fail)
          .on('end', function () {
            server.close()
            rimraf.sync(webhooksDBPath)
            t.end()
          })
      }, 3000)
    }

    res.writeHead(status, {'Content-Type': 'text/plain'})
    res.end()
  })

  server.listen(port)

  let queue = webhooks(opts)

  queue.push(
    `http://127.0.0.1:${port}`,
    {
      event: 'message',
      data: {
        hey: 'ho'
      }
    }
  )

  // terminate, restart, check for persistance
  queue.close(function () {
    queue = webhooks(opts)
  })
})
