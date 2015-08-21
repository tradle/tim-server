# tim-server

Basic HTTP for tradle/tim

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
  -i, --identity [path]   path to identity JSON (see [identity](https://github.com/tradle/identity))
  -k, --keys [path]       path to private keys file (see [kiki](https://github.com/tradle/kiki))
  -p, --port [number]     server port (default: 32123)
  -t, --tim-port [number] port tim will run on (default: 51086)
