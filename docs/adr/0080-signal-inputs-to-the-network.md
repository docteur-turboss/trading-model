# ADR-0080: Signals Enter the Network as Value, Age and Confidence Inputs

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0022](./0022-versioned-model-artifacts.md) (model artifacts), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (point in time), [ADR-0036](./0036-multi-dimension-signals-mvp.md) (signals: confidence and age are inputs, never filters), [ADR-0039](./0039-configuration-feature-flags.md) (feature flags), [ADR-0078](./0078-trainer-features-from-candles-only.md) (18 market inputs)
**Verified by:** `services/trader-trainer/tests/unit/core/signal-inputs.spec.ts`, `services/model-evaluator/tests/unit/evaluate-model.spec.ts`, `bun run config:check`

## Context

The network sees 18 market inputs plus the agent exposure. ADR-0036 (decision 3) says a signal's confidence and age are inputs, never filters; until issue #1298 no signal reached the model.

## Decision

1. **Flag and list.** `FEATURE_SIGNAL_INPUTS` (default `false`) and `TRAINER_SIGNAL_FEATURES`, a list of `SUBJECT:dimension:metric` (`BTC:social:pageviews`; the subject is the asset, its sector or its area, all served by the asset route). Flag off or list empty: the vector, the genome and the manifest are those of ADR-0078.
2. **Layout.** Three inputs per metric, in list order, after the 18 market inputs and before the agent exposure: `SignalValue:<key>`, `SignalAge:<key>`, `SignalConfidence:<key>`. The network input is `19 + 3 × metrics`; `inputDim` is taken from the encoded steps, and the manifest `features.dim` / `features.fields` describe it.
3. **As-of join.** At the close of a candle, the value is that of the newest signal with `observedAt` at or before that instant. Age is `log1p(hours since observedAt) / log1p(8760 h)`, capped at 1. Before the first known value: value 0, age 1, confidence 0. Nothing observed later is read, nothing is filtered on age or confidence.
4. **Normalization.** The value is a z-score with the mean and deviation of the known values in the **training** steps of each window set, clamped to ±5; validation and test never shape them. The statistics of the last window set are stored in the manifest `normalization.signals` (optional field; `formatVersion` and the bus event do not change).
5. **Consumers.** A manifest with `SignalValue:*` fields needs, at inference, the same list, the same join and `normalization.signals` to build its input; a consumer that cannot refuses the model. `model-evaluator` keeps the manifest as sent and reads both layouts. A stored model whose layout differs from the configured one is not rehydrated (ADR-0078 rule).

## Consequences

- A signal older than the 30-day window the session reads (`TRAINER_SYMBOL_ASSETS`) counts as unknown.
- A failed signal read trains the session with unknown signals (zeros, age 1), which the layout cannot tell from "no data yet".
- Choosing the metrics by the genetic algorithm, text signals and live inference stay out of scope.
