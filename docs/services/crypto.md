# @trading-model/crypto — Cryptographic Primitives

Hashing, HMAC, secure randomness and request signing (`X-Signature`, `X-Timestamp`, `X-Service-Name`). Node `crypto` calls live in `node-crypto`.

## Dependency rule

Depends on `primitives`, `contracts`, `common`. Never import `http` or `validation`.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/crypto/node-crypto` | `sha256Hex`, HMAC, random | SHA-256 digests |
| `@trading-model/crypto/constants/crypto-constants` | `CryptoAlg` | Algorithm names |

## Example

```typescript
import { generateInstanceToken } from "@trading-model/crypto/token-service";
```

## See also

[Security](../security/README.md), [common.md](./common.md).
