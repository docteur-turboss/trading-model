# certificate-authority

Centralised mTLS Certificate Authority for the trading-model platform.

## Responsibilities

- X.509 certificate generation and signing
- Automatic certificate rotation (configurable interval)
- Secure certificate distribution via mTLS-protected endpoints
- Certificate revocation (CRL)

## Dependencies

- `@trading-model/common` — shared infrastructure (server, bootstrap, mTLS, validation)
- `@trading-model/certificate-utils` — cryptographic utilities (key generation, CSR, signing)
- MongoDB — persistence for certificates, CRL, and CA metadata

## API Endpoints

| Method | Path                             | Description                                     |
| ------ | -------------------------------- | ----------------------------------------------- |
| `GET`  | `/ping`                          | Lightweight health check                        |
| `GET`  | `/health`                        | Full health (CA initialized, MongoDB connected) |
| `POST` | `/api/v1/certificate/sign`       | Sign a CSR and return certificate               |
| `GET`  | `/api/v1/certificate/:serviceId` | Get current certificate for a service           |
| `POST` | `/api/v1/certificate/revoke`     | Revoke a certificate by serial number           |
| `GET`  | `/api/v1/crl`                    | Get the Certificate Revocation List             |

## Configuration

See `.env.example` for all environment variables. Key settings:

| Variable                    | Default                                       | Description                                  |
| --------------------------- | --------------------------------------------- | -------------------------------------------- |
| `MONGODB_URI`               | `mongodb://mongo:27017/certificate-authority` | MongoDB connection string                    |
| `CA_KEY_PATH`               | `/etc/ca-keys/ca-key.pem`                     | Path to CA private key                       |
| `CERT_ROTATION_INTERVAL_MS` | `86400000` (24h)                              | How often to check for expiring certificates |
| `CERT_DEFAULT_TTL_MS`       | `604800000` (7d)                              | Default certificate validity period          |

## Quality

- `npm run lint` — 0 errors
- `npm run build` — success
- `npm test` — all tests pass
- Coverage target: 80%+ global, 100% for critical crypto paths
