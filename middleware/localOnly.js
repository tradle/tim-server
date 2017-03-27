
const ip = require('ip')

module.exports = function filterIps (req, res, next) {
  if (isPrivateRequest(req)) {
    next()
  } else {
    res.status(403).send('forbidden')
  }
}

function isPrivateRequest (req) {
  const ips = [
    req.ip,
    req.get('x-forwarded-for'),
    req.get('x-real-ip')
  ].filter(val => val)

  return ips.every(ipAddr => ip.isPrivate(ipAddr))
}
