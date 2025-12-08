# TODO
## Documentation
* Rewrite all documentation in English
* Create `ARCHITECTURE.md`
* Create `README.md`
* Provide an `env.example` file
* Add sections about the router and server
* Improve general documentation coverage

## Testing
* Add a complete test structure (unit + integration)

## Security & Authentication
* Implement mTLS for service authentication
* Add a life/shutdown token (different from heartbeat token)
* Add a lifetime control system:
  * Server controls service activity, token validity, and token rotation
* Remove metadata and roles from authentication
* Implement certificate rotation and revocation support
* Enforce strict role separation:
  * Example: a scraper certificate cannot register as a load-balancer

### Heartbeat Token Improvements
* Include a nonce + nonce signature using mTLS keys
* Validate signatures using `timingSafeEqual`
* Stop relying on `Date.now()` inside authentication tokens

## Logging
* Mask or hash tokens/identifiers inside logs

## DDoS Protection
* Rate limiting
* Circuit breaker
* Anti-scan protections
* Request quotas based on certificate fingerprint