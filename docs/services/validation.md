# @trading-model/validation — Environment and Schemas

Zod schemas and validation of the process environment (`validateEnv`), plus shared DTO schemas. A service fails at startup on an invalid environment.

## Dependency rule

Depends on `primitives`, `contracts`, `common`, `http` (+ `zod`). `crypto` depends on it; never import `server-utils` or `crypto` from here.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/validation/application/services/validate-env` | `validateEnv` | Parses and validates `process.env` against a schema |
| `@trading-model/validation/config/env` | `BaseEnvSchema`, `BaseEnv` | Variables common to every service |
| `@trading-model/validation/config/redis-env` | `RedisEnvSchema` | Redis variables |
| `@trading-model/validation/config/address-manager-env` | address-manager env schema | Discovery variables |
| `@trading-model/validation/adapters/outbound/service-resolver.types` | resolver types | Service resolution contracts |

## Example

```typescript
import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
```

## See also

[ENV.md](../deployment/ENV.md), [common.md](./common.md).
