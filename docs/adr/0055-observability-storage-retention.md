# ADR-0055: Observability Storage on K8s: Jaeger Badger on a PVC, Bounded Loki Retention

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0032](./0032-gfs-backup-retention.md) (observability data is not backed up)
**Verified by:** `tests/alerts/alerting.test.yml`, `scripts/observability-gate.mjs`, `tests/k8s/check-overlays.mjs`, `bun run adr:check`

## Context

On K8s, Jaeger `all-in-one` kept traces in memory (lost on every restart, often during the incident), Loki had no retention (the 10 Gi PVC filled up, ingestion stopped, log retention was unbounded: edge logs hold truncated IPs) and the OTel collector had no `memory_limiter` (issue #608, audit M7). The compose already bounds Loki at `744h`.

## Decision

1. **Traces: Jaeger Badger on a 5 Gi PVC `jaeger-data`**, `BADGER_SPAN_STORE_TTL=72h`. The Deployment stays `Recreate` (Badger takes an exclusive lock on its directory), the `restricted` profile and the read-only root FS are kept. **Tempo was not chosen**: it needs an object store and a second query path for no gain at this volume.
2. **Logs: Loki compactor with `retention_enabled: true` and `limits_config.retention_period: 744h`**, identical to the compose and to the data retention register (31 days).
3. **Collector: `memory_limiter`** (400 MiB limit, 100 MiB spike) first in both pipelines, under the 512 Mi container limit.
4. **Alerts** `LokiPushFailing` and `LokiRetentionStale` on Loki's own metrics (Loki is now scraped). The PVC fill ratio is not alerted until the kubelet is scraped.

## Consequences

- Traces older than 72 h are gone; the register and the retention policy say so.
- Observability volumes are not backed up: a lost PVC loses traces and logs.
- `LokiRetentionStale` is silent if the metric disappears; a down Loki is covered by `ServiceDown`.
- Changing the trace backend (Tempo) or a retention duration needs a new ADR and a register update.
