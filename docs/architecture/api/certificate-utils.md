# @trading-model/certificate-utils — Certificate Utilities

Lightweight, synchronous X.509 certificate utility library using only Node.js built-in `node:crypto`. No external crypto dependencies.

## Overview

`@trading-model/certificate-utils` is consumed by the **certificate-authority** service (`docs/architecture/api/certificate-authority.md`) to issue, validate, and manage TLS certificates for the microservice mesh. It uses a **custom certificate format** (JSON + base64 PEM, not RFC 5280) optimised for the platform's internal mTLS needs.

## Dependencies

- `@trading-model/common` — types only
- `node:crypto` (built-in) — `generateKeyPairSync`, `createSign`, `createVerify`, `createPublicKey`, `createHash`, `randomUUID`

---

## API Reference

### Entry Point

```ts
import {
  generateKeyPair,
  KeyAlgorithm,
  createCsr,
  signCertificate,
  validateCertificate,
  certificateInfo,
  createCrl,
  isRevoked,
} from '@trading-model/certificate-utils';
```

### generateKeyPair

```ts
function generateKeyPair(algorithm?: KeyAlgorithm): KeyPair;
```

Generates an asymmetric key pair.

| Parameter   | Type           | Default                | Description                             |
| ----------- | -------------- | ---------------------- | --------------------------------------- |
| `algorithm` | `KeyAlgorithm` | `KeyAlgorithm.EC_P384` | `'rsa'` (RSA 4096) or `'ec'` (EC P-384) |

```ts
interface KeyPair {
  publicKey: string; // PEM-encoded SPKI
  privateKey: string; // PEM-encoded PKCS#8
}
```

**Performance note**:
| Algorithm | Typical duration | Impact |
|-----------|-----------------|--------|
| `KeyAlgorithm.EC_P384` | 10 – 50 ms | Safe for runtime use |
| `KeyAlgorithm.RSA_4096` | 1 – 5 s | **Blocks the event loop** — avoid on hot paths |

### Async API (Worker Thread Pool)

```ts
import {
  generateKeyPairAsync,
  signCertificateAsync,
  createCsrAsync,
  validateCertificateAsync,
} from '@trading-model/certificate-utils/async';
```

Async variants of the heavy crypto operations, executed off the main thread via a `worker_threads` pool (`WorkerPool` from `@trading-model/certificate-utils/worker-pool`).

| Async function                                 | Sync equivalent         | Benefit                                           |
| ---------------------------------------------- | ----------------------- | ------------------------------------------------- |
| `generateKeyPairAsync(algorithm?)`             | `generateKeyPair()`     | Non-blocking key generation (especially RSA 4096) |
| `signCertificateAsync(options)`                | `signCertificate()`     | Non-blocking signing                              |
| `createCsrAsync(options)`                      | `createCsr()`           | Consistent API (negligible perf gain)             |
| `validateCertificateAsync(certPem, caCertPem)` | `validateCertificate()` | Consistent API (negligible perf gain)             |

The worker pool is lazily initialized: the first call to any async function spawns `availableParallelism()` workers. Workers are reused for subsequent calls. Call `WorkerPool::terminate()` on the pool instance to shut down cleanly.

```ts
import { WorkerPool } from '@trading-model/certificate-utils/worker-pool';

const pool = new WorkerPool({ size: 4 });
const result = await pool.execute<KeyPair>('generateKeyPair', { algorithm: 'ec' });
await pool.terminate();
```

### KeyAlgorithm

```ts
const KeyAlgorithm = {
  RSA_4096: 'rsa',
  EC_P384: 'ec',
} as const;
```

### createCsr

```ts
function createCsr(options: CsrOptions): string;
```

Creates a Certificate Signing Request in custom PEM format.

```ts
interface CsrOptions {
  commonName: string;
  san: string[];
  keyPem: string;
}
```

Returns a PEM-armored string containing a base64-encoded JSON body with `{ commonName, san, publicKey, signature }`.

### signCertificate

```ts
function signCertificate(options: SignOptions): SignedCertificate;
```

Signs a CSR using the CA key and returns a signed certificate.

```ts
interface SignOptions {
  csr: string;
  serviceId: string;
  caKeyPair: KeyPair;
  caCertPem: string;
  ttlMs: number;
}

interface SignedCertificate {
  serialNumber: string; // 16-char hex from UUID
  certPem: string; // Custom PEM format
  caPem: string;
  serviceId: string;
  issuedAt: Date;
  expiresAt: Date;
  fingerprint: string; // SHA-256 hex digest of certPem
}
```

The certificate body contains `{ body, signature, issuerCert }` where `body` includes serial, issuer, subject, validity dates, SAN, and public key.

### validateCertificate

```ts
function validateCertificate(certPem: string, caCertPem: string): ValidationResult;
```

Validates a certificate's signature chain and temporal validity.

```ts
interface ValidationResult {
  valid: boolean;
  reason?: string;
}
```

Checks performed:

1. Signature verification against the CA public key
2. `notBefore` ≤ now ≤ `notAfter`
3. CA chain validation (if `caChain` present — see hierarchical CA)
4. Root CA self-signature verification (if chain present)

Returns `{ valid: false, reason: '…' }` for malformed PEM, expired certs, signature mismatch, or parsing errors.

**Validation cache**: Results are cached in an in-memory LRU cache (1000 entries, 60s TTL). Repeated calls with the same `certPem` return the cached result without re-parsing or re-verifying. Call `clearValidationCache()` to reset.

### certificateInfo

```ts
function certificateInfo(certPem: string): CertificateInfo;
```

Extracts metadata from a signed certificate without validating it.

```ts
interface CertificateInfo {
  serialNumber: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string; // SHA-256 hex digest
  san: string[];
}
```

### createCrl

```ts
function createCrl(revoked: RevokedCertificate[], ttlMs?: number): Crl;
```

Creates an in-memory Certificate Revocation List.

| Parameter | Type                   | Default | Description                          |
| --------- | ---------------------- | ------- | ------------------------------------ |
| `revoked` | `RevokedCertificate[]` | —       | List of revoked certificates         |
| `ttlMs`   | `number`               | 7 days  | CRL validity period for `nextUpdate` |

```ts
interface RevokedCertificate {
  serialNumber: string;
  serviceId: string;
  revokedAt: Date;
  reason: string;
}

interface Crl {
  entries: RevokedCertificate[];
  lastUpdate: Date;
  nextUpdate: Date;
}
```

### isRevoked

```ts
function isRevoked(serialNumber: string, crl: Crl): boolean;
```

Checks if a serial number appears in the CRL. Revocation entries expire after **365 days** (hardcoded, not configurable).

---

## Resilience & Performance

### Synchronous crypto — event loop blocking

All functions are **synchronous** — they use `generateKeyPairSync`, `createSign`, `createVerify`, etc. This means every call blocks Node.js's single-threaded event loop.

| Operation             | Duration (EC P-384) | Duration (RSA 4096) | Impact                            |
| --------------------- | ------------------- | ------------------- | --------------------------------- |
| `generateKeyPair`     | 10 – 50 ms          | 1 – 5 s             | Blocks all other requests         |
| `signCertificate`     | 10 – 50 ms          | 100 – 500 ms        | Blocks heartbeat, discovery, etc. |
| `validateCertificate` | < 10 ms             | < 10 ms             | Low impact                        |
| `createCsr`           | < 10 ms             | < 10 ms             | Low impact                        |

In the context of the `certificate-authority` service, a single `POST /api/v1/certificate/sign` with RSA 4096 blocks the event loop for 100–500 ms, delaying:

- Heartbeats to the discovery-server (may trigger lease expiry)
- Other certificate requests in the queue
- Metrics collection and health checks

### Limits & Thresholds

| Limit                          | Value                                           | Impact                                                                                                 |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Key generation (RSA 4096)      | 1 – 5 s synchronous                             | Blocks event loop entirely                                                                             |
| Key generation (EC P-384)      | 10 – 50 ms synchronous                          | Brief event loop block                                                                                 |
| Certificate signing (RSA 4096) | 100 – 500 ms synchronous                        | Delays heartbeat + other requests                                                                      |
| CSR creation                   | < 10 ms synchronous                             | Negligible                                                                                             |
| Validation                     | < 10 ms synchronous                             | Negligible                                                                                             |
| CRL revocation expiry          | 365 days (hardcoded)                            | Revocations never auto-clean after 1 year                                                              |
| CRL entries                    | Unlimited in-memory array                       | No pagination; grows unbounded                                                                         |
| Coverage enforcement           | 100 % branches / functions / lines / statements | Quality guarantee; `maxWorkers: 1` confirms no parallelism                                             |
| Validation cache               | 1000 entries / 60s TTL / LRU eviction           | Caches `validateCertificate` results by PEM hash; avoids re-parsing and re-verifying on repeated calls |

### Orphan Detector / Re-Allocator

Not present. This package has zero awareness of `@trading-model/common/recovery/`. The orphan detector and re-allocator belong to the **job worker system** (worker-registry, job-queue) used by `job-scheduler` and `audit-logger` — completely orthogonal.

### Workers

A `worker_threads` pool is available via the async API (`@trading-model/certificate-utils/async`). The pool is **lazily initialized**: the first call to any async function spawns `availableParallelism()` workers. Workers are reused across calls.

```ts
import { generateKeyPairAsync } from '@trading-model/certificate-utils/async';

// Non-blocking: runs in a worker thread
const keyPair = await generateKeyPairAsync('rsa');
```

The sync API (`generateKeyPair`, `signCertificate`, etc.) remains unchanged and still executes on the main thread. Consumers should use the async variants in request handlers to avoid blocking the event loop:

| Context                                                        | Use                                         |
| -------------------------------------------------------------- | ------------------------------------------- |
| Express request handler (e.g. `POST /api/v1/certificate/sign`) | `signCertificateAsync()`                    |
| Bootstrap / startup (blocking is acceptable)                   | `generateKeyPair()`                         |
| CPU-intensive batch signing (10+ RPS)                          | `signCertificateAsync()` with `Promise.all` |

The underlying `WorkerPool` class is also available directly:

```ts
import { WorkerPool } from '@trading-model/certificate-utils/worker-pool';

const pool = new WorkerPool({ size: 4 });
const result = await pool.execute<KeyPair>('generateKeyPair', { algorithm: 'ec' });
await pool.terminate();
```

---

## Known Limitations

### Custom certificate format (not X.509)

The certificate format is **not RFC 5280** — certs are JSON objects (`{ body, signature, issuerCert }`) base64-encoded inside PEM headers/footers. This means:

| Limitation                               | Consequence                                                    |
| ---------------------------------------- | -------------------------------------------------------------- |
| Incompatible with OpenSSL                | Cannot use `openssl x509 -text`, `openssl verify`, etc.        |
| Incompatible with Java keytool           | Cannot import into Java truststores                            |
| Incompatible with standard TLS libraries | Only usable within this platform's custom validation logic     |
| No ASN.1 encoding                        | Serial numbers, validity, and extensions are plain-text fields |

### CRL grows unbounded

`RevokedCertificate[]` is stored in memory as a plain array with no pagination or size limit. Revocation entries expire after 365 days (hardcoded in `isExpiredRevocation`), which is **not configurable**. The CRL can grow indefinitely if revocations accumulate faster than the 1-year expiry window.

### Async API (opt-in, worker pool)

Async variants are available at `@trading-model/certificate-utils/async`. They execute crypto operations in a `worker_threads` pool, preventing event loop blocking. The sync functions remain the default (backward compatible).

For batch operations, combine with `Promise.all`:

```ts
const [caKeys, svcKeys] = await Promise.all([
  generateKeyPairAsync('rsa'),
  generateKeyPairAsync('ec'),
]);
```

### Single-threaded bottleneck at high throughput

With synchronous crypto, Node.js's event loop is blocked during every key generation and signing operation. At the `certificate-authority` service level:

- **1 RPS** (RSA 4096 signing) → event loop blocked ~20 % of the time → acceptable
- **10 RPS** (RSA 4096 signing) → event loop blocked ~200 % of the time → queue grows unbounded, heartbeats fail, instance de-registers

**Mitigation**: Use EC P-384 keys for most services. Reserve RSA 4096 for the root CA only, generated once at bootstrap. Offload signing to `worker_threads` if throughput exceeds 1 RPS.

---

## Multi-Continent Compatibility

**The package has no multi-continent awareness.** It is:

- **Stateless** — no network calls, no database, no shared cache
- **Synchronous** — no async I/O
- **In-process** — no clustering, no replication

### Gaps for distributed multi-region deployment

| Gap                           | Status             | Problem                                                                                                                                                                                                     |
| ----------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hierarchical CA**           | ✅ Resolved        | Root CA + intermediate CA per region supported. `caChain` in `SignedCertificate` + `issuerCaCertPem`/`isRoot` in `CaMetadata`. The intermediate CA cert is pre-generated and signed by the offline root CA. |
| **Async signing**             | ✅ Resolved        | `signCertificateAsync` offloads to worker threads. See [Async API](#async-api-worker-thread-pool).                                                                                                          |
| **Active-active replication** | ❌ Not implemented | A single CA signs all certificates. If the CA's region goes down, no new certificates can be issued.                                                                                                        |
| **Distributed CRL cache**     | ❌ Not implemented | The CRL exists only in memory + MongoDB (via the certificate-authority service). Each CA instance must re-fetch from MongoDB; no pub/sub CRL distribution.                                                  |
| **Single CA private key**     | ❌ Not implemented | The CA key pair is stored in MongoDB + disk. No HSM integration, no automatic rotation.                                                                                                                     |

### Recommendations for multi-region

1. **Use EC P-384** for all leaf certificates — RSA 4096 is 100× slower and unnecessary for TLS.
2. **Use async signing** via `signCertificateAsync()` — prevents event loop blocking during cross-region requests (already done).
3. **Deploy one CA per region** with a shared root CA (offline) and region-specific intermediate CAs (already supported via `caChain`).
4. **Set aggressive CRL refresh intervals** — the CRL should be replicated via the message bus (pub/sub), not polled.
5. **Consider a dedicated worker server** for sites with >10 RPS signing throughput, to pool workers across CA instances.
