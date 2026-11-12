# ADR-0068: Test Segment for the Published Model Metrics

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0022](./0022-versioned-model-artifacts.md) (manifest metrics), [ADR-0025](./0025-ga-fitness-wired-to-fitness-type.md) (metrics definition), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (point-in-time, MT4 test candles)
**Verified by:** `services/trader-trainer/tests/unit/market-data/test-segment.spec.ts`, `services/trader-trainer/tests/unit/genetic-algorithm/evaluation-pipeline.spec.ts`, `bun run contracts:check`

## Context

The live trainer split its data 80 / 20 into training and validation and selected the best genome on the validation. The published `sharpe`, `avgPnl` and `maxDrawdown` came from the same data: biased upward by the selection itself (audit risque-trading 2026-11-11, M1, issue #885). Only the MT4 script had a real test segment.

## Decision

1. The steps are cut in time order: `train | validation | test`, `TRAINER_TEST_SPLIT` (0.15, new) is a fraction of all the steps. The test segment is cut first; `TRAINER_VALIDATION_SPLIT` (0.15) is then a fraction of what remains, not of all the steps. With 499 steps: test 75, validation 64, train 360 (about 72 / 13 / 15 %, not 70 / 15 / 15).
2. Training and GA selection read train and validation only. After the session, the published genome is evaluated once on the test segment (`WindowSet.test`, same evaluation as the selection: wallet PnL, epsilon 0.05).
3. `sharpe`, `avgPnl` and `maxDrawdown` of the manifest, of the API and of `training.model.published` come from the test, and say so: `evaluatedOn: "test"` (`"validation"` for older manifests, where the field is absent). `fitness` stays the selection fitness.
4. `MODEL_METRICS_VERSION` goes from 4 to 5: never compare version 5 metrics with older ones.
5. `hasEnoughTrainingData` requires `MIN_TRAINING_STEPS` in each of the three segments. With the default buffer (500 candles, 499 steps): 75 test, 64 validation, 360 train steps.
6. Walk-forward folds (>= 2) cut the test segment first and fold the rest; the same test is attached to each window and read once from the last. Multi-fold testing is out of scope.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| `TRAINER_WALK_FORWARD_FOLDS >= 2` only | Every fold stays a selection segment: no isolated test |
| Keep validation metrics, label them | Honest but unusable for an admission gate |

## Consequences

Training uses 70 % of the steps instead of 80 %. Metrics of a model are now one out-of-sample estimate on about 75 bars: noisy, but unbiased by selection. The test segment is reused by each training run on newer data, so successive models are compared on different bars.
