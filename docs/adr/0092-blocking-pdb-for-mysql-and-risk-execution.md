# ADR-0092: Blocking PodDisruptionBudgets for mysql-0 and risk-execution

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0085](./0085-single-mysql-and-spire-server-pods-accepted.md) (its "B, blocking PDB now" rejection is replaced here for MySQL; the single pods stay accepted), [ADR-0024](./0024-pod-spread-across-nodes.md) (spread and PDBs)
**Verified by:** `tests/k8s/check-overlays.mjs` (production keeps maxUnavailable 0 on mysql-pdb and risk-execution-pdb; staging and staging-local render maxUnavailable 1)

## Context

The resilience audit of 2026-11-25 (findings C1 and M2, issue #2816) shows that a voluntary `kubectl drain` evicts `mysql-0` (PDB `maxUnavailable: 1` on one replica) and `risk-execution` (one replica, `Recreate`, PVC RWO, no PDB) without resistance: ingestion stops, financial-scraper is not ready, the kill switch engages on `stale_data` and must be re-armed by hand.

ADR-0085 rejected a blocking PDB on MySQL while production has one node ("manual step on every node update, against `KUBERNETES.md` and #917"). The owner revisited that choice on 2026-11-26 (issue #2816, option 1): an accidental drain also happens on one node, and the protection must be the default, so that a forgotten patch shows up as a refused drain instead of a silent outage.

## Decision

- **Base manifests:** `mysql-pdb` (`deploy/k8s/infra/mysql.yaml`) and `risk-execution-pdb` (`deploy/k8s/services/risk-execution.yaml`) use `maxUnavailable: 0`. A voluntary eviction of `mysql-0` or of the risk-execution pod is refused. Every new overlay inherits it.
- **Staging:** the overlay patch of every PodDisruptionBudget (`deploy/k8s/overlays/staging/kustomization.yaml`, inherited by `staging-local`) keeps `maxUnavailable: 1`, so kind and CI stay drainable.
- **Exception to the non-blocking PDB rule** of `docs/deployment/KUBERNETES.md` and issue #917: only these two singletons. Forcing a drain is an explicit operator act (`kubectl drain --disable-eviction`, or deleting the pod), which stops ingestion and trading; the kill switch is re-armed afterwards ([runbook-database-failover](../operations/runbooks/runbook-database-failover.md#loss-of-mysql-0-pod-or-node)).

### Exit condition

With one replica, `maxUnavailable: 0` blocks every drain, whatever the node count. When MySQL or risk-execution runs several replicas (HA, out of scope here), replace its PDB with a `minAvailable` lower than the replica count.

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| Blocking PDB in the production overlay only | A forgotten patch in a new environment lets a drain through unnoticed |
| risk-execution only | A drain of `mysql-0` still stops ingestion, so risk-execution engages on `stale_data` anyway |
| No change (ADR-0085 as is) | An accidental drain keeps stopping ingestion and trading |

## Consequences

### Positive

- An accidental or automated drain no longer stops ingestion and trading.

### Negative

- Every node update needs a manual forced drain; automated node updaters (kured, managed upgrades) stay blocked on these pods.
