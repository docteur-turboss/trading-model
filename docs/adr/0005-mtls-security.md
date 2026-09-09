# ADR-0005: Mutual TLS for All Inter-Service Communication

**Status:** Superseded by [ADR-0011](./0011-spiffe-spire-workload-identity.md)
**Date:** 2026-06

## Context

A trading platform handling financial data requires strong authentication and encryption between all services. The security model must:

- Prevent unauthorized services from joining the mesh
- Encrypt all traffic in transit
- Support automated certificate rotation
- Provide revocation capability

## Decision

Use **mutual TLS (mTLS)** for all inter-service HTTPS communication, with a dedicated **Certificate Authority** service managing the full X.509 certificate lifecycle.

### Architecture

```
[Service] ←──mTLS (client cert + server cert)──→ [Service]
                ↑                        ↑
                |                        |
         [Certificate Authority]
         - CSR signing
         - Certificate rotation (24h check)
         - CRL management
```

- Each service presents a client certificate signed by the internal CA
- All connections require both server and client certificate validation
- The `certificate-client` package handles automatic bootstrap and renewal
- A Certificate Revocation List (CRL) is published for compromised certs

## Alternatives Considered

| Alternative                   | Reason for Rejection                                       |
| ----------------------------- | ---------------------------------------------------------- |
| Pre-shared keys (PSK)         | No revocation; key rotation harder; no PKI                 |
| JWT-based auth                | No transport encryption; requires separate TLS anyway      |
| Vault PKI                     | External dependency; operational complexity for 9 services |
| Self-signed certs per service | No central authority; no revocation; manual management     |

## Consequences

### Positive

- Strong mutual authentication (both sides verified)
- Automatic certificate rotation via `certificate-client` bootstrap
- CRL enables fast revocation of compromised services
- Single internal CA simplifies trust management
- All traffic encrypted (no plaintext internal communication)

### Negative

- Certificate management overhead (bootstrap, renewal, monitoring)
- Additional CPU cost for TLS handshake (negligible at <1000 req/s)
- Startup dependency on CA availability (mitigated by cached certificates)
- Complex debugging when certificates expire or are misconfigured

### Mitigations

- `createSecureServer` handles TLS config centrally via `@trading-model/common`
- Health checks include certificate expiry monitoring
- Runbooks document certificate issues (`docs/operations/runbooks/runbook-certificate-expiry.md`)
- CI validates certificate configuration in integration tests
