# @trading-model/reliability — Resilience Building Blocks

Circuit breaker, circuit state machine, latency tracker and heartbeat interfaces, used by the HTTP client and the service discovery layer.

## Dependency rule

Depends on `@trading-model/primitives` and `@trading-model/contracts` only (no `common`, no `http`).

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/reliability/circuit-state-machine` | `CircuitStateMachine`, `CircuitBreakerConfig`, `DEFAULT_CIRCUIT_CONFIG` | Closed / open / half-open transitions (the one services import) |
| `@trading-model/reliability/circuit-breaker` | `CircuitBreaker` | Wraps a call with a state machine |
| `@trading-model/reliability/circuit-machine-registry` | `CircuitMachineRegistry` | One machine per endpoint key |
| `@trading-model/reliability/latency-tracker` | `LatencyTracker` | Rolling latency window |
| `@trading-model/reliability/heartbeat-interfaces` | heartbeat ports | Contracts for heartbeat senders |

## Example

```typescript
import {
  CircuitStateMachine,
  DEFAULT_CIRCUIT_CONFIG,
} from "@trading-model/reliability/circuit-state-machine";
```

## See also

[address-manager.md](./address-manager.md), [common.md](./common.md#package-map-post-split).
