# ADR-0090: Admission Waiver Limited to the E2E Overlay

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (success criteria), [ADR-0069](./0069-model-admission-verdict-on-the-test-segment.md) (admissible), [ADR-0087](./0087-paper-decision-consumer.md) (decision-consumer), [ADR-0064](./0064-risk-and-execution-context-before-order-flow.md) (risk-execution)
**Verified by:** `services/decision-consumer/tests/unit/decide.spec.ts` (waived model decides), `bun run config:check` (ALLOWED_UNSET: no deployment profile sets the variable)

## Context

The E2E case "promoted model to intent to paper order to position" (issue #2743) cannot pass the admission gate: the trainer only reads 1-minute bars, so the gate needs 43 200 test bars, and the Binance stub serves 200 flat ones. Both `decision-consumer` (ADR-0087 §2) and `risk-execution` (pre-trade check, ADR-0069) refuse a model whose manifest is not `admissible`. The owner chose (2026-11-26) a waiver limited to the E2E overlay.

## Decision

1. `DECISION_SKIP_ADMISSION` (default `false`) makes `decision-consumer` load a non-admissible model and `risk-execution` treat every model as admissible. Only `tests/e2e/docker-compose.e2e.yml` sets it.
2. Both services refuse to start with it when `NODE_ENV=production`. The overlay sets `NODE_ENV=development` for them. No other compose file, K8s config or overlay sets it (`config:check`).
3. The ACL of `risk-execution` is unchanged and the test sends no intent by hand: the intent comes from the promoted model.
4. After training, the test reads `symbol@version` through the gateway and recreates `decision-consumer` with `PROMOTED_MODELS`.

## Consequences

- Known limit: in E2E the tested path is not the production one (the gate is bypassed). The gate itself stays covered by unit tests of both services.
