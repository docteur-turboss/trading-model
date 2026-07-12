# certificate-authority — Certificate Authority

Centralised mTLS Certificate Authority for the trading-model platform. Handles X.509 certificate generation, CSR signing, automatic rotation, secure distribution, and certificate revocation (CRL).

## Why a Dedicated CA Service

In a zero-trust architecture, every service must authenticate every peer. Using a shared static certificate for all services would mean compromising one service compromises all. A dedicated CA service provides:

- **Per-service certificates**: Each service gets a unique certificate, so compromise is isolated
- **Automatic rotation**: Certificates are short-lived and rotated regularly, limiting exposure if a key is leaked
- **Central revocation**: A compromised certificate can be revoked immediately, and all services learn about it via CRL updates over the message bus
- **Audit trail**: Every certificate issuance and revocation is logged

The alternative — using a public CA or manual OpenSSL — was rejected because public CAs don't support the custom short-lived certificate format optimized for machine-to-machine communication, and manual management doesn't scale to 9+ services with automatic rotation.

## General Information

| Property         | Value                                                                |
| ---------------- | -------------------------------------------------------------------- |
| Service name     | `certificate-authority`                                              |
| Port (host)      | `8447`                                                               |
| Port (container) | `3000`                                                               |
| Dependencies     | `@trading-model/common`, `@trading-model/certificate-utils`, MongoDB |

## REST Endpoints

### Health

**`GET /ping`**

Lightweight health check.

**Response:** `200 OK`

```json
{
  "status": "ok"
}
```

**`GET /health`**

Full health status including CA initialization state.

**Response:** `200 OK` when ready:

```json
{
  "status": "ok",
  "caInitialized": true,
  "caFingerprint": "sha256-abc123..."
}
```

**Response:** `503` when CA not yet initialized.

### Certificate Operations

**`POST /api/v1/certificate/sign`**

Sign a Certificate Signing Request (CSR) and return a signed certificate.

**Request Body:**

```json
{
  "serviceId": "financial-scraper-service",
  "csr": "-----BEGIN CERTIFICATE REQUEST-----...",
  "ttlMs": 604800000
}
```

**Response:** `200 OK`

```json
{
  "cert": "-----BEGIN CERTIFICATE-----...",
  "caPem": "-----BEGIN CERTIFICATE-----...",
  "serialNumber": "abc-123-def",
  "expiresAt": "2025-01-22T10:30:00Z",
  "fingerprint": "sha256-xyz789..."
}
```

**`GET /api/v1/certificate/:serviceId`**

Get the current certificate for a service.

**Response:** `200 OK` or `404` if not found.

**`POST /api/v1/certificate/revoke`**

Revoke a certificate by its serial number.

**Request Body:**

```json
{
  "serialNumber": "abc-123-def",
  "reason": "keyCompromise"
}
```

**Response:** `200 OK`

```json
{
  "message": "Certificate revoked"
}
```

### Certificate Revocation List

**`GET /api/v1/crl`**

Get the Certificate Revocation List.

**Response:** `200 OK`

```json
{
  "lastUpdate": "2025-01-15T10:30:00Z",
  "entries": [
    {
      "serialNumber": "revoked-serial-001",
      "revokedAt": "2025-01-14T08:00:00Z",
      "reason": "keyCompromise"
    }
  ]
}
```

## Architecture

```
Client ──POST /api/v1/certificate/sign──→ Certificate Authority
Client ──GET /api/v1/certificate/:id────→ Certificate Authority
Client ──POST /api/v1/certificate/revoke─→ Certificate Authority
Client ──GET /api/v1/crl────────────────→ Certificate Authority
                                            │
                                     CertificateAuthority (core)
                                            │
                                   ┌───────┼───────┐
                                   │       │       │
                             Certificate  CrlStore  CaStore
                               Store    (MongoDB)  (MongoDB)
                             (MongoDB)

                    Rotator (scheduled task) ── checks expiring certs
```

- **CA Bootstrap:** On first start, generates RSA 4096-bit key pair, creates self-signed CA certificate, persists to MongoDB and disk.
- **Signing:** Validates CSR, signs with CA key, returns PEM certificate with metadata.
- **Revocation:** Adds entry to CRL collection with serial number and reason.
- **Rotation:** Scheduled task checks for expiring certificates at configurable interval and margin.
- **Persistence:** Stores certificates, CRL entries, and CA metadata in separate MongoDB collections.

## Environment Variables

| Variable                    | Default                                       | Description                                                 |
| --------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `PORT`                      | `3000`                                        | Service listen port                                         |
| `MONGODB_URI`               | `mongodb://mongo:27017/certificate-authority` | MongoDB connection                                          |
| `CA_KEY_PATH`               | `/etc/ca-keys/ca-key.pem`                     | Path to CA private key                                      |
| `CA_CERT_TTL_MS`            | `31536000000` (1 year)                        | CA root certificate validity                                |
| `CERT_ROTATION_INTERVAL_MS` | `86400000` (24h)                              | Check interval for expiring certs                           |
| `CERT_ROTATION_MARGIN_MS`   | `17280000` (~4.8h)                            | Rotation margin before expiry                               |
| `CERT_DEFAULT_TTL_MS`       | `604800000` (7 days)                          | Default issued certificate TTL                              |
| `CERT_MAX_TTL_MS`           | `31536000000` (1 year)                        | Maximum allowed TTL for issued certificates                 |
| `DISCOVERY_SERVICE_URL`     | `https://discovery-server:3000`               | Discovery server URL                                        |
