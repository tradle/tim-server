
const ip = require('ip')

module.exports = function filterIps (req, res, next) {
  if (ip.isPrivate(req.ip)) {
    next()
  } else {
    res.status(403).send('forbidden')
  }
}
