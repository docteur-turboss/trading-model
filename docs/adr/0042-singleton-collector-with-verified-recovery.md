# ADR-0042: Singleton Collector Kept, Recovery Verified After Each Deploy

**Status:** Superseded by [ADR-0057](./0057-collector-handover-through-a-lease.md)
**Date:** 2026-11
**Related:** [ADR-0024](./0024-pod-spread-across-nodes.md) (read only), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `deploy/k8s/scripts/deploy-k8s.sh`

## Context

`financial-scraper-collector` runs `replicas: 1` with `strategy: Recreate` and `terminationGracePeriodSeconds: 360`. Each release stops collection for up to 6 min plus startup, and nothing checked that collection resumed (audit deploiement 2026-11-05, M3, issue #420). Options: leader election by Kubernetes `Lease` with 2 replicas (A), singleton plus verified recovery (B), B now and A later. The project owner chose B (issue #420, 2026-11-05).

## Decision

1. Keep the singleton and `Recreate`. The gap during a release is accepted and documented in `docs/deployment/DEPLOY.md`.
2. `deploy-k8s.sh verify-market-data` runs after the rollout and smoke test in `deploy.yml`. It succeeds once the new collector pod reports `fs_candles_persisted_total` > 0 (same signal as `MarketDataStale`), within `MARKET_DATA_RECOVERY_TIMEOUT` (600 s).
3. Production: timeout fails the job and triggers the automatic rollback. Staging: explicit warning.
4. Leader election stays an option if the gap becomes unacceptable (new ADR).

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Leader election by `Lease`, 2 replicas | New RBAC, client dependency, double-collection risk, 15-30 s failover; not chosen by the owner |
| Do nothing | Gap undetected at each release |
