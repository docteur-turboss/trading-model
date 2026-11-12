# ADR-0020: Database Topology As Deployed — MySQL and MongoDB

**Status:** Accepted
**Date:** 2026-10
**Supersedes:** [ADR-0003](./0003-mongodb-persistence.md), [ADR-0004](./0004-mysql-group-replication.md)
**Related:** [ADR-0011](./0011-spiffe-spire-workload-identity.md) (SPIRE datastore in MySQL until [ADR-0065](./0065-spire-datastore-sqlite-and-4h-svid-ttl.md)), [ADR-0019](./0019-message-broker-as-built.md)
**Verified by:** manual review 2026-10-28 (`deploy/k8s/infra/mysql.yaml`, `deploy/k8s/infra/mongodb.yaml`, `deploy/k8s/infra/mongo-audit.yaml`, `docker-compose.yml`); `tests/k8s/run-kind.sh` and `bun run test:db` exercise single-node instances only

## Context

Checking the 13.09 audit finding on ADR/runtime drift (2026-10-28) showed that the two database ADRs no longer describe what is deployed.

**ADR-0004 (MySQL)** says: MySQL 8, Group Replication in **multi-primary** mode, "automatic failover with multi-primary writes". The manifests say:

- `group_replication_single_primary_mode=on` (`deploy/k8s/infra/mysql.yaml`): single primary, not multi-primary.
- `group_replication_start_on_boot=off`, and the `mysql-cluster-init` Job bootstraps the group on `mysql-0` **only**. Nothing runs `START GROUP_REPLICATION` on `mysql-1` and `mysql-2`: in production (3 replicas, until issue #814) they were standalone servers that received no data. The group has one member.
- Every client (financial-scraper, SPIRE server, migration Jobs) connects through the `mysql-primary` Service, whose selector is pinned to the pod `mysql-0`. Even with a healthy group, a primary election would not move the Service.
- Staging and the kind smoke test run 1 replica; compose runs one MySQL without Group Replication.

So there is **no automatic failover**: losing `mysql-0` stops market data ingestion and the SPIRE server (its datastore), until the pod comes back with its volume. *Amended by [ADR-0065](./0065-spire-datastore-sqlite-and-4h-svid-ttl.md): the SPIRE datastore is SQLite on the server's own volume, so losing `mysql-0` only stops ingestion.*

**ADR-0003 (MongoDB)** says: one shared MongoDB replica set, one database per service, and rejects "separate MongoDB per service" as too much overhead. K8s runs exactly the rejected option: two StatefulSets, `mongo-dlq` (`rs0`) and `mongo-audit` (`rs0-audit`), 3 members each, initiated by their own init Jobs. Compose runs one standalone `mongo` (no replica set) shared by audit-logger and dlq-service. ADR-0003 also still carried a `certificate-authority` scope, already superseded by ADR-0011.

Both ADRs stayed `Accepted` because no check ties an ADR to the runtime.

## Decision

Record the topology as deployed, including what it does not provide.

### MySQL (market data; SPIRE datastore until ADR-0065)

| | Compose / staging / kind | Production |
| --- | --- | --- |
| Servers | 1 | StatefulSet of 3 (`mysql-0..2`), Group Replication plugin loaded, single-primary |
| Members of the group | — | `mysql-0` only (bootstrapped by `mysql-cluster-init`) |
| Write endpoint | `mysql` (compose) / `mysql-primary` | `mysql-primary` → pod `mysql-0` |
| Failover | none | **none** |
| Protection against data loss | encrypted daily backups (`scripts/backup-lib.sh`), restore drills | same |

Schema, keys and query patterns (composite primary keys, `ts-sql-query`, migrations by `scripts/migrate.mjs`) are unchanged from ADR-0004.

### MongoDB (audit-logger, dlq-service)

| | Compose | K8s (staging 1 member, production 3) |
| --- | --- | --- |
| audit-logger | `mongo` (standalone, shared), database `audit-logger`, collections `audit_events`, `audit_chain_state` (`audit_jobs` retired by ADR-0029) | `mongo-audit` replica set `rs0-audit`, database `audit` |
| dlq-service | same `mongo`, database `dlq`, collection `dlq_entries` | `mongo-dlq` replica set `rs0`, database `dlq` |

The K8s split is kept: the audit trail (hash-chained, compliance) and the DLQ have different retention and backup needs, and a DLQ storm must not slow the audit writes. The compose sharing is a dev simplification only.

### Making MySQL highly available

Real HA is a separate decision, not taken here. The options are known: either finish Group Replication (join `mysql-1/2` with `START GROUP_REPLICATION`, restart the group on boot, and route writes to the elected primary through MySQL Router or a readiness probe on `group_replication_primary_member`), or drop to one MySQL replica and rely on backups and restore time. Issue #814 chose the second: the production StatefulSet runs `replicas: 1` (the SPIRE datastore left MySQL in ADR-0065, so no failover requirement remains). The Group Replication config and `mysql-cluster-init` stay: they bootstrap the one-member group on `mysql-0`, and a later HA decision can add members back.

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| Edit ADR-0003 / ADR-0004 in place | ADRs are immutable once accepted; a superseding ADR records when and why the description changed |
| Fix MySQL HA in the same change | It changes the failure behaviour of ingestion and of SPIRE, and needs its own failover test (kill `mysql-0` on kind). Documenting the real state first removes the false sense of safety now |

## Consequences

### Positive

- Runbooks and incident response can rely on the ADR: `mysql-0` is a single point of failure, MongoDB is two replica sets in K8s.
- Production runs one MySQL pod: the topology matches what it provides. Existing PVCs `mysql-data-mysql-1` / `mysql-data-mysql-2` are not deleted by the scale-down; the operator removes them by hand (runbook-database-failover).

### Negative

- The platform still has no MySQL failover. RTO for a lost `mysql-0` node is the time to reschedule the pod with its volume, or to restore the last backup.

### Follow-up

- Decide MySQL HA (one of the two options above) in a new ADR, with a kind failover test.
- An automated check of this topology (e.g. a render test over the production overlay) would let this ADR point to a test instead of a manual review.
