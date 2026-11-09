# ADR-0057: Collector Handed Over Through a Kubernetes Lease

**Status:** Accepted
**Date:** 2026-11
**Supersedes:** [ADR-0042](./0042-singleton-collector-with-verified-recovery.md)
**Related:** [ADR-0041](./0041-least-privilege-deploy-identities.md) (the deploy identity holds the rights of the new Role), [ADR-0044](./0044-singleton-trainer.md) and [ADR-0058](./0058-trainer-handover-through-a-lease.md) (the trainer got the same handover), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `services/financial-scraper/tests/unit/app/collector-leadership.spec.ts`, `tests/k8s/check-overlays.mjs`, `tests/k8s/run-kind.sh`, `tests/alerts/alerting.test.yml`

## Context

ADR-0042 kept `financial-scraper-collector` as a `Recreate` singleton: each release stopped the old pod (grace 60 s, publishes in flight drained), then started the new one (SPIFFE, discovery, readiness). No market data was collected in between. Candles were caught up by the publish backlog, but the trades, tickers and order books of that window were lost. The release of v3.1.0 targets no service interruption, and the deployment audit of 2026-11 lists the gap (M3, issue #702). ADR-0042 already named leader election as the way out if the gap became unacceptable.

## Decision

1. **Election by Lease.** The collector pods compete for the Lease `financial-scraper-collector` (`coordination.k8s.io/v1`, env `COLLECTOR_LEASE_NAME`). Only its holder runs the scrape and signal crons (`CollectorLeadership`, `services/financial-scraper/src/application/collector-leadership.ts`). The adapter `KubernetesLease` follows client-go's leader election: an update carries the `resourceVersion` it read (409 = lost), and a candidate judges expiry from when it last saw the Lease change, on its own clock (no clock skew).
2. **Bounded timings.** Lease duration 15 s, renew deadline 10 s, retry 2 s (client-go's defaults). A holder stops scheduling cycles 10 s after the start of its last successful renewal attempt, enforced by a timer that does not wait for the API call in flight (a slow API server cannot stretch it, as client-go's `context.WithTimeout(RenewDeadline)`); a renewal answered more than 10 s after it started does not count. A candidate waits 15 s after the last change it saw, which is never before the start of the write it saw. A holder that sees another holder or loses a write (409) stops at once.
3. **Handover on SIGTERM.** The holder stops its crons, waits for the running cycle and its publishes in flight (bounded by `PUBLISH_ACCEPT_TIMEOUT_MS`), then releases the Lease (holder cleared). The successor takes it on its next attempt (2 s), without waiting for expiry. A failed release is logged; the Lease then expires. A drain longer than 15 s also lets the Lease expire before the release: harmless, since the old pod no longer starts cycles, and the successor takes over at expiry instead. A Lease acquired by an attempt that ends after SIGTERM is released at once.
4. **Rollout.** `replicas: 1`, no HPA, `RollingUpdate` with `maxUnavailable: 0` and `maxSurge: 1`: the new pod is ready before the old one gets SIGTERM. During `preStop` (10 s) the old pod still collects. The gap is the drain plus up to 2 s plus the wait for the next cron tick. Scrape ticks are aligned to wall-clock minutes, so in production the new pod usually runs the next scheduled cycle.
5. **Least privilege.** The Lease is a manifest (applied without `spec`, so a release never overwrites the holder). The Role `financial-scraper-collector-lease` grants `get` and `update` on that Lease name only, and has no `create` (which `resourceNames` cannot restrict). It is bound to the ServiceAccount `financial-scraper`. Only the collector pod mounts the token (`automountServiceAccountToken: true` on its template; the ServiceAccount keeps `false`). The NetworkPolicy `financial-scraper-collector-apiserver` opens 443 and 6443 to private ranges for the API server. The deploy identity gets `leases` in `app-role.yaml`.
6. **Without a Lease name** (compose, dev), the collector collects at once, as before.
7. **Observability.** `fs_collector_leader` is 1 on the pod that collects. Alert `CollectorNoLeader` fires when no scraper pod reports 1 for 2 min ([runbook-market-data-stale](../operations/runbooks/runbook-market-data-stale.md#collectornoleader)).
8. **Checks.** `check-overlays.mjs` requires the strategy above, `COLLECTOR_LEASE_NAME`, the Lease, and a Role limited to it. The kind job measures, in MySQL with the Binance stub (scrape every 10 s), the longest gap between two order books of BTCUSDT across the upgrade N-1 → N and across a rolling restart of N. It must stay under 30 s. `verify-market-data` stays after the rollout.

## Consequences

- Two pods never start cycles at the same time while the API server answers. Under a partition, a holder stops scheduling at 10 s and a successor starts at 15 s at the earliest. A cycle already running (bounded by the Binance and MySQL timeouts) may still end after that. Candles, tickers and trades are upserted on their business keys (migration 004, `trade_id`), so the same rows from both pods merge; an order book is keyed by its fetch time, so an overlap only adds a snapshot. The trainer skips candles it already has.
- A collector that takes the Lease again after losing it starts from fresh cursors (`ScrapeCronOrchestrator.start`), so it does not republish from a stale publish cursor.
- The first upgrade from a release without the Lease (3.0.x → 3.1.0) runs the old pod, which has no Lease, next to the new one until the old pod stops: up to its preStop and drain (about 30 s), both collect, with the effects of the previous point.
- The collector now talks to the Kubernetes API: if the API server is unreachable for more than 10 s, collection stops (`CollectorNoLeader` after 2 min) until it answers again.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Keep ADR-0042 (Recreate, verified recovery) | Loses the trades, tickers and order books of each release window |
| `@kubernetes/client-node` | A large dependency for two HTTP calls; the API is read with axios, already a dependency |
| Two permanent replicas (hot standby) | Doubles the collector's resources for a gap of seconds; one surge pod during a rollout is enough |
| Lease in Redis or MySQL | Adds a lock to stores the collector does not otherwise coordinate through; Kubernetes already gives Lease semantics and RBAC |
