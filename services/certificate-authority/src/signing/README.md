# Certificate Signing Module

This module handles all certificate signing operations. It is separated from the management layer to enable future decomposition into an independent `certificate-signer` service.

## Responsibilities

- Certificate signing request (CSR) validation and processing
- X.509 certificate issuance
- WebSocket-based certificate signing protocol
- Rate-limited signing endpoint
- Nonce management

## Boundaries

- Does NOT handle CRL management
- Does NOT handle key rotation
- Does NOT handle certificate lifecycle beyond issuance
- Communicates with management layer via message bus events

## Future Service (planned)

```
certificate-signer (port 8453)
  - POST /api/v1/certificate/sign
  - POST /api/v1/certificate/renew
  - WS /ws (WebSocket signing protocol)
  - GET /metrics

certificate-manager (port 8454)
  - POST /api/v1/certificate/revoke
  - GET /api/v1/crl
  - POST /api/v1/rotate
  - GET /metrics
```
