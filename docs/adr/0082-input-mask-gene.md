# ADR-0082: The GA Evolves a Mask over the Input Groups

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0025](./0025-fitness-type-and-dqn-genes.md) (genes), [ADR-0039](./0039-configuration-feature-flags.md) (feature flags), [ADR-0081](./0081-signal-inputs-to-the-network.md) (signal inputs)
**Verified by:** `services/trader-trainer/tests/unit/genetic-algorithm/input-mask.spec.ts`, `bun run config:check`

## Context

The GA evolves layers, learning genes and its own control, not what the network looks at. With signal inputs (ADR-0081) the metrics are picked by hand.

## Decision

1. **Flag.** `FEATURE_INPUT_MASK_GENE` (default `false`). Off: no mask, no extra random draw, same genome and manifest as before.
2. **Gene.** `network.inputMask`: one boolean per group, `candle` (9 fields and the bias), `window` (8 sliding closes), then one group per `TRAINER_SIGNAL_FEATURES` key (value, age, confidence). A masked group is set to 0 at the network input; `inputDim` and the weights keep their size, so crossover stays gene with gene (per group, from either parent).
3. **Mutation.** Each group flips with probability 0.05. A result with every group off is replaced by the parent mask: one group stays active.
4. **Manifest.** `genome.network.inputMask` is an optional field of the stored genome; `formatVersion` and the bus event do not change. A consumer applies the same mask before the network.
5. **Measure.** `tt_input_group_active{group,scope}`: share of genomes with the group active, in the last generation (`population`) and in the published genome (`published`).

## Consequences

- The order book, book ticker, trades and ticker groups of the issue do not exist as network inputs (ADR-0078): they are not groups.
- Protecting the candle group by configuration is not implemented.
- `model-evaluator` does not run the network: it keeps the manifest as sent.
