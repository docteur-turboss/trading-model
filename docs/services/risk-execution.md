# Risk Execution

**Package:** `risk-execution`
**Path:** `services/risk-execution/`
**Port:** 8454 (`RISK_EXECUTION_PORT`), container `trading-risk-execution`

## Role

Owns every order and the kill switch ([ADR-0064](../adr/0064-risk-and-execution-context-before-order-flow.md)). Paper only: simulated broker, no live adapter. Limits and re-arm rules: [risk-limits-policy](../compliance/risk-limits-policy.md).

## Routes

Listed in [openapi/internal/risk-execution.yaml](./openapi/internal/risk-execution.yaml): `/intents`, `/orders/{clientOrderId}/cancel`, and the `/admin/*` routes (kill switch, re-arm, status), which accept only the service's own identity.

## State

Durable files in `RISK_STATE_DIR` (`/data/risk-execution`): `state.json` (kill switch, orders) and `paper-ledger.json`. Compose volume `risk-execution-data`; ReadWriteOnce PVC in K8s. An unreadable state engages the global kill switch.

## Configuration

`EXECUTION_MODE`, `RISK_*`: see [ENV.md](../deployment/ENV.md).

## Operations

[runbook-risk-execution](../operations/runbooks/runbook-risk-execution.md).
