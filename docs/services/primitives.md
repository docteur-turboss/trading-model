# @trading-model/primitives — Domain Primitives

Pure domain primitives shared by every other package and service: branded types, numeric and date ranges, pagination, service identity and the registry of service instance names. It is a foundation of the dependency graph (ADR-0016).

## Dependency rule

**Zero dependencies**, internal or external. `primitives` never imports `@trading-model/contracts` or any higher package, and its `package.json` has no `dependencies`. `bun run deps:check` enforces it ([ADR-0016](../adr/0016-shared-contracts-ownership.md)).

## Main exports

Imports use the subpath of the source file (`exports` maps `./*` to `dist/*.js`). The 5 most used by services:

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/primitives/primitives` | `UserId`, `AuthToken`, `Role`, `Environment`, … (`X.of(value)` brands, some with a `toX` alias) | Branded string/number types so ids cannot be mixed |
| `@trading-model/primitives/service-identity` | `ServiceIdentity`, `HostPort`, `ServiceEndpoint` | Who a service is and where it listens |
| `@trading-model/primitives/service-instance-name` | `ServiceInstanceName`, `ALL_SERVICE_NAMES`, `parseServiceName`, `registerServiceName` | Canonical list of service names |
| `@trading-model/primitives/numeric-range` | `NumericRange` | Min/max bounds (GA genes, parameters) |
| `@trading-model/primitives/topic-binding` | `TopicBinding` | Topic ↔ callback binding for the message bus |

Also present: `circuit-state`, `date-range`, `pagination`, `json-object`, `token-validation`, `db-connection-config`.

## Example

```typescript
import { toUserId, type UserId } from "@trading-model/primitives/primitives";
import { ALL_SERVICE_NAMES } from "@trading-model/primitives/service-instance-name";

const id: UserId = toUserId("alice");
```

## See also

[common.md](./common.md#package-map-post-split) (package map), [ADR-0007](../adr/0007-common-package-split.md), ADR-0016.
