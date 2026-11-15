# @trading-model/crypto — Cryptographic Primitives

Hashing, HMAC, secure randomness, instance token generation and validation, and request signing (`X-Signature`, `X-Timestamp`, `X-Service-Name`). Node `crypto` calls live in `node-crypto`.

## Dependency rule

Depends on `primitives`, `contracts`, `common`. Never import `http`, `validation` or `server-utils`.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/crypto/request-signer` | `signRequest`, `verifySignature`, `buildSignedHeaders` | HMAC request signature with freshness check |
| `@trading-model/crypto/token-service` | `generateInstanceToken`, `validInstanceToken`, `generateInstanceId` | Discovery instance tokens |
| `@trading-model/crypto/node-crypto` | `sha256Hex`, `sha256Base64url`, HMAC, random | SHA-256 digests |
| `@trading-model/crypto/timestamp` | `isTimestampFresh` | Replay window |
| `@trading-model/crypto/constants/crypto-constants` | `CryptoAlg` | Algorithm names |

## Example

```typescript
import { buildSignedHeaders } from "@trading-model/crypto/request-signer";
import { isTimestampFresh } from "@trading-model/crypto/timestamp";
```

## See also

[Security](../security/README.md), [common.md](./common.md).
