# ADR-0049: Downstream Context and Contract for Trained Models and Collected Signals

**Status:** Proposed
**Date:** 2026-11
**Related:** [ADR-0022](./0022-versioned-model-artifacts.md) (versioned artifacts, closed weights route), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (walk-forward criteria), [ADR-0036](./0036-multi-dimension-signals-mvp.md) (signals), [ADR-0019](./0019-message-broker-as-built.md) (bus), [ADR-0039](./0039-configuration-feature-flags.md) (feature flags), [ADR-0011](./0011-spiffe-spire-workload-identity.md) (identities)

This ADR is a proposal: the owner decides. It creates no service and changes no manifest.

## Context

The two business outputs of the platform have no consumer (checked on `00b5bc78`):

- **Trained models.** The trainer writes an immutable artifact per symbol (ADR-0022) and publishes `training.model.published` (`packages/contracts/src/training-events.ts`). The only subscriber is audit-logger, which subscribes to every topic. The weights route `GET /models/:symbol/:version/weights` is service-to-service only and answers 403 to every caller while `MODEL_DOWNLOAD_CALLERS` is empty: it is empty in `deploy/k8s/config/trader-trainer.properties` (line 41) and in `docker-compose.yml` (line 379, default `${MODEL_DOWNLOAD_CALLERS:-}`).
- **Signals.** financial-scraper collects the sources of `signal-registry.json` (ADR-0036) and serves them at `GET /financial-scraper/signals/assets/:assetId`. trader-trainer does not read them: a case-insensitive search for `signal` in `services/trader-trainer/src` finds one comment (`application/server.ts:34`, readiness). ADR-0036 records that no Analyst or Sector Manager exists.

No Strategy, Execution or Evaluation context exists. The value produced stops at the artifact file, and the architecture cannot be checked on the flow that matters: the trading decision. `SIGNAL_COLLECTION_ENABLED=true` in `deploy/k8s/config/financial-scraper.properties` (line 38). `git log -- services/financial-scraper/src/config/signal-registry.json` shows a single commit (`2059e861`, PR #383): no source was added then removed.

## Decision (proposed)

### 1. Contract of any downstream context

Whatever option is chosen, the downstream context depends on the existing, versioned surface and nothing else:

1. **Trigger:** subscribe to `training.model.published` through message-manager (ADR-0019). The event is a notification; the consumer treats a delivery as at-least-once and idempotent on `(symbol, version)`, both carried by the event with the weights `sha256` (published only once the artifact is stored; the deduplication id derives from `(symbol, version)`).
2. **Read:** `GET /models/:symbol/:version` (manifest, public) then `GET /models/:symbol/:version/weights` (service-to-service). The consumer verifies the weights against `x-model-sha256` and the manifest. The manifest carries the topology, the feature layout and the normalization statistics: the consumer rebuilds the agent from it and never from trainer code (ADR-0022).
3. **Caller identity:** the consumer gets its own SPIFFE identity (ADR-0011), an ACL entry on trader-trainer, and its service name added to `MODEL_DOWNLOAD_CALLERS` in `deploy/k8s/config/trader-trainer.properties` and in the compose environment. These changes ship with the consumer, not before.
4. **Admission:** a model is used for decision only if it meets the ADR-0030 walk-forward criteria. The manifest metrics are the only evidence available until a consumer states otherwise.
5. **Signals** are read through the existing serving route; a consumer weighs `confidenceScore` and the age (`now - observedAt`) as features (ADR-0036, decision 3).

### 2. Options for the downstream context

| Option | What it is | Advantages | Drawbacks | Cost |
| --- | --- | --- | --- | --- |
| A. Nothing for now | Keep the state, document it | No cost, no new surface | The trading decision stays unvalidated; artifacts accumulate unused | None |
| B. Offline inference | A batch evaluation job (CLI or CronJob, no order flow) reads each new artifact, replays it on stored candles and signals, and records metrics | Smallest step that exercises the contract end to end; checks ADR-0030 criteria on every model; no market risk | Not a live decision; still a new deployable | One small service or job, one SPIFFE entry, one ACL entry |
| C. Paper trading | A service consumes the event, runs the model on live market data and keeps a simulated wallet | Validates the real decision flow and latency | Largest scope: market feed, state, wallet, alerts, runbooks | A full service (Strategy + simulated Execution + Evaluation) |

**Recommendation: B**, shaped as the contract of section 1 so that C can reuse it. B proves the event, the artifact read, the identity and the ACL with no market exposure. Live execution is out of scope.

### 3. Collected signals while nobody consumes them

| Option | Effect |
| --- | --- |
| Freeze: `SIGNAL_COLLECTION_ENABLED=false` | Stops the load on public APIs (SEC EDGAR, ECB, NWS, Wikimedia) and the MySQL growth. History is lost for good: for ECB, NWS and Wikimedia, `observedAt` is the first collection that saw a value (ADR-0036, decision 3), so a gap cannot be backfilled point-in-time. |
| Keep, with the reason recorded | History accumulates for the future consumer; the cost is small (requests rate-limited per source). |

**Recommendation: keep collecting** and record why: a future consumer needs point-in-time history that cannot be rebuilt (ADR-0030), the sources are free for any use (ADR-0036, decision 2), and the load is bounded by `maxRequestsPerMinute`. Revisit if MySQL growth or a source's terms change. Freezing is one flag away (ADR-0039) and needs the owner's decision: this ADR changes no manifest.

## Consequences

- If the owner accepts B or C, a follow-up change adds the consumer, its identity, its ACL entry and the `MODEL_DOWNLOAD_CALLERS` value, and this ADR moves to Accepted with a `**Verified by:**` line.
- Until then, `bounded-contexts.md` and `system-overview.md` state that models and signals have no consumer.
- The trainer is not changed to read signals: that is a separate decision once a consumer defines which signals matter.
