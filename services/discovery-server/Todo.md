# TODO
## Testing
* Add a complete test structure (integration)

## Security & Authentication
* Add a life/shutdown token (different from heartbeat token)
* Add a lifetime control system:
  * Server controls service activity, token validity, and token rotation
* Implement certificate rotation and revocation support
* Enforce strict role separation:
  * Example: a scraper certificate cannot register as a load-balancer

### Heartbeat Token Improvements
* Include a nonce + nonce signature using mTLS keys
* Stop relying on `Date.now()` inside authentication tokens

## Logging
* Mask or hash tokens/identifiers inside logs

## DDoS Protection
* Circuit breaker
* Anti-scan protections