# tim-server

Basic HTTP server for [tradle/tim](https://github.com/tradle/tim)

_this module is used by [Tradle](https://github.com/tradle/tim)_

## Usage

```bash
tim-server <options>
```

Example:
```bash
tim-server -i ./identity.json -k ./keys.json
```

### Options
```
-h, --help              print usage
-i, --identity [path]   path to identity JSON (see https://github.com/tradle/identity)
-k, --keys [path]       path to private keys file (see https://github.com/tradle/kiki)
-p, --port [number]     server port (default: 32123)
-t, --tim-port [number] port tim will run on (default: 51086)
```

## Paths

### Read

#### /me

See if tim's identity has been published on the blockchain

#### /identities

Print identities known to tim

#### /identity/:id

Print a given identity. {id} is the rootHash or a fingerprint of one of the identity's keys

#### /chained

See everything tim has loaded from the blockchain

### Write

#### /self-publish

Publish tim's identity on the blockchain. You need to do this every time you edit identity.json and want your edits recorded on the blockchain. You can think of it as something like "git push"

*Async

#### /send

Send a message to another party, and optionally record it on blockchain

Parameters:
  msg: JSON string  
  public: Boolean (default: false)
  chain: Boolean (default: false)  
  to: Array of ids (fingerprints or root hashes of identities)

*Async

*Async - This operation is asynchronous, so you will need to check back for results.

## Misc

While debugging, you may find it useful to look at the contents of the various leveldb databases tim creates. [level-dump](https://npmjs.org/package/level-dump) can do that for you easily.

Example:

```bash
ls -al
...
drwxr-xr-x 10 user group  340 Aug 21 14:01 bill-addressBook.db/
drwxr-xr-x 12 user group  408 Aug 21 14:01 bill-messages.db/
drwxr-xr-x 12 user group  408 Aug 21 14:01 bill-msg-log.db/
drwxr-xr-x  9 user group  306 Aug 21 14:01 bill-txs.db/
...
level-dump bill-messages.db
level-dump bill-addressBook.db
```
