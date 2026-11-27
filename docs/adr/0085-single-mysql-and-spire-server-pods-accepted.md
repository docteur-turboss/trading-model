# ADR-0085: One MySQL Pod and One spire-server Pod Are Accepted Until the Production Topology Is Known

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0020](./0020-database-topology-as-deployed.md) (MySQL topology, Follow-up closed here), [ADR-0024](./0024-pod-spread-across-nodes.md) (spread and PDBs), [ADR-0031](./0031-point-in-time-recovery-hourly-archives.md) (RPO 1 h), [ADR-0065](./0065-spire-datastore-sqlite-and-4h-svid-ttl.md) (SPIRE datastore, SVID TTL 4 h), [ADR-0092](./0092-blocking-pdb-for-mysql-and-risk-execution.md) (replaces the rejection of B for MySQL: blocking PDB in the base)
**Verified by:** manual review 2026-11-20 (`deploy/k8s/infra/mysql.yaml`, `deploy/k8s/infra/spire/spire-server.yaml`, `docs/deployment/BACKUP_DR.md`); the restore of MySQL and of the SPIRE volume after the loss of the cluster is the restore drill of `tests/k8s/run-kind.sh`

## Context

The resilience audit of 2026-11-20 (finding C1, Critical, issue #1749) points out that MySQL and spire-server each run one pod in production, with no failover, and that their PodDisruptionBudgets (`maxUnavailable: 1`) do not stop a `kubectl drain`:

- `deploy/k8s/infra/mysql.yaml`: `replicas: 1`, PVC RWO `mysql-data`, PDB `mysql-pdb` `maxUnavailable: 1`.
- `deploy/k8s/infra/spire/spire-server.yaml`: `replicas: 1`, strategy `Recreate`, same PDB.

Losing the node of `mysql-0` stops market data ingestion and training until the pod comes back with its volume, or until a restore (RPO 1 h, ADR-0031). spire-server can be down as long as the issued SVIDs stay valid: about 2 h after the server stops (TTL 4 h, ADR-0065; RTO 2 h in `docs/deployment/BACKUP_DR.md`). ADR-0020 already recorded the single MySQL pod and left a Follow-up: decide MySQL HA in a new ADR.

Three options were on the table (issue #1749):

- **A.** Keep one pod and accept the outage, with the RTO of `BACKUP_DR.md`.
- **B.** Blocking PDB (`minAvailable: 1`) on MySQL and spire-server in the production overlay: a drain is refused until the operator stops the pod on purpose.
- **C.** A MySQL replica with failover (source/replica replication or an InnoDB Cluster operator), with a failover test on kind.

## Decision

- **MySQL: option A.** One pod. The loss of `mysql-0` is accepted, with the 4 h RTO and the 1 h RPO of `docs/deployment/BACKUP_DR.md`.
- **spire-server: the risk is accepted.** One pod, non-blocking PDB. The margin is the remaining SVID lifetime (about 2 h, ADR-0065); the restore of its datastore and CA keys is exercised by the kind restore drill in CI.

The production node count is not decided yet: today only staging runs, on a local kind cluster. On a single physical node, B and C protect against nothing: the node failure takes MySQL, its replica and spire-server down together. C costs several days (ADR, manifests, kind failover test, PITR backup and `restore-k8s.sh` changes) and only pays off with at least 2 nodes. B adds a manual step to every node update and contradicts the non-blocking PDB choice of `docs/deployment/KUBERNETES.md` and issue #917, for no gain on one node.

### Revisit condition

Reopen this decision when production has at least 2 nodes. B is then the best cost/protection ratio (two lines in the production overlay). C is the option if losing ingestion for the RTO becomes unacceptable. The condition is repeated in the [Kubernetes prerequisites](../deployment/KUBERNETES.md#prerequisites).

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| B, blocking PDB now | Manual step on every node update, against `KUBERNETES.md` and #917, no protection on one node (replaced for MySQL by ADR-0092, 2026-11-26) |
| C, MySQL replica with failover now | Several days of work, no protection while the replica shares the node of the primary |

## Consequences

### Positive

- The single points of failure are written down and owned, with their RTO; the ADR-0020 Follow-up on MySQL HA is closed.
- No change to manifests, backups or the restore procedure.

### Negative

- A `kubectl drain` or the loss of the node of `mysql-0` stops ingestion and training until the pod restarts or the restore ends.
- A spire-server outage longer than the SVID margin stops all mTLS.
