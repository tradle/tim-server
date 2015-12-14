
var LOCAL_IP_REGEX = /^(?:::ffff:)?127\.0\.0\.1$/

module.exports = function filterIps (req, res, next) {
  if (LOCAL_IP_REGEX.test(req.ip)) {
    next()
  } else {
    res.status(403).send('forbidden')
  }
}
