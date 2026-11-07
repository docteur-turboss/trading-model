# @trading-model/crypto — Cryptographic Primitives

Hashing, HMAC, secure randomness, instance token generation and validation, and request signing (`X-Signature`, `X-Timestamp`, `X-Service-Name`). Node `crypto` calls live in the outbound adapters (`adapters/outbound/node-*`).

## Dependency rule

Depends on `primitives`, `contracts`, `common`. Never import `http`, `validation` or `server-utils`.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/crypto/application/services/request-signer` | `signRequest`, `verifySignature`, `buildSignedHeaders` | HMAC request signature with freshness check |
| `@trading-model/crypto/application/services/token-service` | `generateInstanceToken`, `validInstanceToken`, `generateInstanceId` | Discovery instance tokens |
| `@trading-model/crypto/adapters/outbound/node-hash` | `sha256Hex`, `sha256Base64url` | SHA-256 digests |
| `@trading-model/crypto/domain/services/timestamp` | `isTimestampFresh` | Replay window |
| `@trading-model/crypto/domain/constants/crypto-constants` | `CryptoAlg` | Algorithm names |

## Example

```typescript
import { buildSignedHeaders } from "@trading-model/crypto/application/services/request-signer";
import { isTimestampFresh } from "@trading-model/crypto/domain/services/timestamp";
```

## See also

[Security](../security/README.md), [common.md](./common.md).
