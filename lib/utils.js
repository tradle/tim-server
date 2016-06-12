const crypto = require('crypto')
const ALGORITHM = 'aes-256-cbc'
const SALT_BYTES = 32
const IV_BYTES = 16
const KEY_BYTES = 32
const ITERATIONS = 20000
const DIGEST = 'sha256'

exports.encrypt = function encrypt (data, password) {
  const salt = crypto.randomBytes(SALT_BYTES)
  const iv = crypto.randomBytes(IV_BYTES)
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_BYTES, DIGEST)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()])
  return Buffer.concat([
    salt,
    iv,
    ciphertext
  ])
}

exports.decrypt = function decrypt (data, password) {
  const salt = data.slice(0, SALT_BYTES)
  const iv = data.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const ciphertext = data.slice(SALT_BYTES + IV_BYTES)
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_BYTES, DIGEST)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString()
}
