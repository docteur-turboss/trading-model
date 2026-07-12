# Certificate Client

**Package:** `@trading-model/certificate-client` (v1.0.0)
**Path:** `packages/certificate-client/`

## Role

Automatic mTLS certificate provisioning for services. On startup, the client bootstraps a certificate from the Certificate Authority, manages its lifecycle (renewal before expiry), and subscribes to CRL updates via the broker-message event system.

## Dependencies

| Dependency                         | Type    |
| ---------------------------------- | ------- |
| `@trading-model/common`            | runtime |
| `@trading-model/certificate-utils` | runtime |
| `@trading-model/broker-message`    | runtime |

## Exports

| Export                    | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| `createTlsBootstrap`      | Main entry point — provisions certificate and returns TLS config |
| `CertificateClient`       | Client class for manual lifecycle management                     |
| `subscribeToCertificateEvents` | Subscribes to certificate revocation events                 |
| `bootstrapCertificate`    | Provisions a certificate from the CA                             |
| `bootstrapFromEnv`        | Bootstrap using environment variables                            |
| `bootstrapConfigFromEnv`  | Reads bootstrap config from environment                          |
| `createHttpsServer`       | Creates an HTTPS server with the provisioned certificate         |

## Environment Variables

See [Environment Variables](../../deployment/ENV.md#certificate-client--all-services-with-mtls).
