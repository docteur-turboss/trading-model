# ADR-0079: The Model Manifest Carries the Window and the Simulator to Replay It

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0022](./0022-versioned-model-artifacts.md) (manifest), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (point in time, criteria), [ADR-0049](./0049-downstream-context-for-models-and-signals.md) §1.4 (model-evaluator), [ADR-0066](./0066-simulated-fills-at-next-bar-open-with-execution-costs.md) (simulator), [ADR-0069](./0069-model-admission-verdict-on-the-test-segment.md) (admission), [ADR-0078](./0078-trainer-features-from-candles-only.md) (candle features)
**Verified by:** `services/trader-trainer/tests/unit/adapters/outbound/model-metrics.spec.ts` (replay of a published model), `services/model-evaluator/tests/unit/evaluate-model.spec.ts`, `bun run api:check`

## Context

model-evaluator only checks weight integrity (issue #1256, audit M4). To replay a published model on stored candles it lacks what the manifest never wrote: the test segment is the newest 15 % of the steps of a window that slides at every cycle; features are normalised point by point from the first candle (ADR-0030), so the replay needs the start of the window, not only the test segment; and the simulator constants (fee, execution cost, trade fraction) live in trader-trainer code only. The trainer's selection ratios are measured with a 5 % random exploration (`EVAL_EPSILON`) and an unkept RNG; its admission ratios (ADR-0069) are one greedy pass, which the replay reproduces.

## Decision

Owner's choice, option 2 on issue #1256: two pull requests, the contract first.

1. **Manifest `replay` block** (optional, ADR-0061 compatible): `from` (open of the first candle), `testFrom` (timestamp of the first test step), `to` (close of the last candle), `intervalMs`, `evalEpsilon`, and `simulator` (`initialCash`, `feeRate`, `executionCostRate`, `tradeFraction`, `observePosition`, one constant `SIMULATOR_PARAMS` shared with the training backend). A manifest without it (published before this ADR, or without a test segment) cannot be replayed: the consumer records `failed` with the reason `no-window`.
2. **The ratio code moves to `@trading-model/model-runtime`**, behaviour unchanged: `EpisodeScores` (Sharpe, Sortino, Calmar), `barsPerYear`, `buyAndHoldSharpe`. The trading agent, the per-candle features and the point-in-time normalisation still sit in trader-trainer and move in the second pull request, with the consumer.
3. **A replay plays greedy** (epsilon 0) and says so in the record (`policy: "greedy"`); it does not promise the manifest's ratios. The check against the trainer runs the trainer's code at epsilon 0 on the same bars.
4. Second pull request: model-evaluator reads the candles from `from` to `to` (never later) through the candle read route of financial-scraper, replays, writes `replay: done | failed`, and joins the ACL of that route.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| One pull request for contract, move and consumer | Too large to review; the contract should be read alone before a consumer depends on it |
| Replay with only the test segment | Other normalisation statistics, so other inputs than the training's |
| Freeze the RNG and the 5 % exploration in the manifest | Ties the contract to the trainer's internal sampling; a greedy replay is simpler and stated |
| Integrity checker only (no replay) | The trainer stays the only judge of a model (audit M4) |

## Consequences

- Manifests gain about 150 bytes; the trainer writes the block only when the session has a test segment.
- Window times come from the trainer's candle buffer at storage time; a buffer replaced while a session trains would shift them (the trainer replaces candles only before a session).
