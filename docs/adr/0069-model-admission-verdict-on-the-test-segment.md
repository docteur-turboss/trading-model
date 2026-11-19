# ADR-0069: Model Admission Verdict on the Test Segment

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (criteria), [ADR-0068](./0068-test-segment-for-published-model-metrics.md) (test segment), [ADR-0049](./0049-downstream-context-for-models-and-signals.md) §1.4 (admission), [ADR-0022](./0022-versioned-model-artifacts.md) (manifest), [ADR-0061](./0061-n-1-compatibility-of-public-api-and-bus-messages.md) (compatible event change)
**Verified by:** `services/trader-trainer/tests/unit/adapters/outbound/model-metrics.spec.ts`, `services/trader-trainer/tests/unit/application/trainer.spec.ts`

## Context

Every trained model was stored and announced by `training.model.published` whatever its results. ADR-0049 §1.4 left the ADR-0030 admission rule to a future consumer, which has neither the test segment nor buy and hold on its bars (audit risque-trading 2026-11-11, B2, issue #880).

## Decision

1. After each session the trainer checks, on the test segment metrics of the published genome (ADR-0068), the ADR-0030 criteria one segment allows, after fees and execution costs: annualised Sharpe >= 1.0, Sortino >= 1.5, Calmar (annualised mean bar PnL / max drawdown) >= 1.0, and Sharpe above buy and hold's on the same test bars. Thresholds are domain constants (`ADMISSION_THRESHOLDS`, shared with `mt4-walk-forward.ts`). The t-statistic and the stability need several segments and seeds: they stay MT4 criteria.
2. No verdict without test segment metrics: validation metrics are biased by the selection. No verdict either under `MIN_ADMISSION_TEST_BARS` = 1440 test bars (one day of one-minute bars; `barsPerYear` bars, one year, when that is fewer: about 252 for daily bars, which 1440 would put out of reach): the ratios are annualised (x sqrt(`barsPerYear`), x `barsPerYear` for Calmar), and on a few dozen bars a tiny positive mean passes every threshold.
3. The manifest carries `admission: { admissible, evaluatedOn: "test", criteria, thresholds }`; `training.model.published` carries `admissible` (optional field, ADR-0061); `tt_model_admission_total{result="admissible|rejected"}` counts them. A manifest without `admission` is not admissible; the trainer counts it as `rejected`.
4. A rejected model is still stored and published: the audit-logger keeps the trace and the failure stays visible.
5. `admissible` makes a model eligible, not live: no automatic promotion. A model's first use for decision is a manual promotion, and real capital still needs MT4 to pass (ADR-0030, ADR-0049 §1.4).

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Do not publish rejected models | Hides the failure and loses the event the audit-logger records |
| Leave the check to the consumer | It has neither the test segment nor buy and hold on its bars |
| Also require the t-statistic and the stability | Undefined on one segment and one seed |

## Consequences

Even 1440 test bars make one noisy estimate: an admissible model may be lucky (ADR-0030 results), hence the manual promotion. With the default window (`TRAINER_DATA_WINDOW` 500, `TRAINER_TEST_SPLIT` 0.15: 75 test bars) no verdict is given until the window is raised to about 9600 bars (1440 / 0.15); the default is unchanged (memory and session duration). Manifests written before this ADR have no `admission`.
