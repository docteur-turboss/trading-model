# ADR-0062: SPIRE Server Datastore in SQLite on Its Own Volume, SVID TTL 4 Hours

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0011](./0011-spiffe-spire-workload-identity.md) (SPIRE, datastore in MySQL: amended), [ADR-0020](./0020-database-topology-as-deployed.md) (MySQL without failover: amended), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand/contract), [ADR-0032](./0032-gfs-backup-retention.md) (backup retention)
**Verified by:** `tests/k8s/run-kind.sh` (step verify_identity_without_mysql: every MySQL pod stopped, the SPIRE server restarts and a restarted pod gets an SVID; restore drill of the SQLite datastore and CA keys), `tests/backup/backup-partial.test.sh`, `tests/backup/fetch-offsite.test.sh`, `tests/alerts/alerting.test.yml` (alert CertificateExpiry)

## Context

In Kubernetes the SPIRE server (1 replica, `Recreate`) kept its datastore in the `spire` database of the market data MySQL (ADR-0011), reached through `mysql-primary`, a Service pinned to the pod `mysql-0` with no failover (ADR-0020). Losing `mysql-0` or its node stopped SVID issuance at once. With `default_x509_svid_ttl = "1h"` every SVID expired within the hour: the whole mTLS mesh went down, and any pod started meanwhile got no identity. One database pod took down every service, and recovery needed a human (volume recovery or encrypted restore). Exploitation audit of 2026-11-10, finding C1 (critical), issue #802.

Compose already ran the server on SQLite next to its CA keys (`deploy/compose/spire/server.conf`).

## Decision

1. **Datastore.** The K8s SPIRE server uses `DataStore "sql"` with `database_type = "sqlite3"`, file `/run/spire/data/datastore.sqlite3` on its own PVC `spire-server-data` (RWO, 1Gi), the same model as compose. SPIRE opens it in WAL mode. One replica and `strategy: Recreate` stay: one writer. The init container that created the `spire` database and the `MYSQL_ROOT_PASSWORD` variable are removed. The SPIRE pod holds no MySQL credential at all, which also meets the goal of issue #807 (SPIRE no longer logs in as `root`): the dedicated MySQL user `spire` and its key `MYSQL_SPIRE_PASSWORD` it introduced (never released) are removed, since no release reads them (N-1 still uses `root` for a rollback, until the contract step). Losing `mysql-0` now only stops market data ingestion.
2. **CA keys of the new datastore.** The KeyManager writes `/run/spire/data/keys-sqlite.json`, not `keys.json`. A server started on an empty datastore finds no CA journal and prepares a new CA: with the same key file it would overwrite the keys the MySQL journal refers to. Keeping both files apart lets a rollback to the previous release find its MySQL datastore and its `keys.json` intact.
3. **SVID TTL 4 hours** (`default_x509_svid_ttl = "4h"`, K8s and compose). SVIDs are renewed at half-life: a stopped or unschedulable SPIRE server leaves about 2 hours before the first SVID expires, the recovery window for the remaining single point (the server itself, its RWO volume bound to a node). `ca_ttl` stays 168 h.
4. **Agents bootstrap again on a CA change.** The K8s agents run with `rebootstrap_mode = "always"`, `rebootstrap_delay = "1m"`: when the server's certificate no longer chains to their stored bundle, they exit, bootstrap from the `spire-bundle` ConfigMap (written by the server's `k8sbundle` notifier) and re-attest with `k8s_psat`. `always` makes an agent fail rather than silently run without it. The compose agent attests with a join token, which cannot re-attest: unchanged.
5. **Alert.** `CertificateExpiry` fires when the served SVID has less than 1 hour left (it was 30 minutes for a 1 h TTL): renewal at 2 hours left has then been stalled for over an hour.
6. **Backup and restore.** The `spire` component of a run becomes `spire/data_<TS>.tar.age`, as in compose: a `sqlite3 .backup` snapshot of the datastore, then `keys-sqlite.json` read after it (a new CA key is written before it is journaled, so the key file covers the journal). It runs in the `spire-entries` sidecar (image `spire-tools`, now with `sqlite`), which mounts the volume read-write (a WAL reader needs the `-shm` file and locks) and keeps the snapshot in a memory `emptyDir`. `restore-k8s.sh` writes both files back with the server stopped and removes the WAL files of the replaced datastore. A run taken before this ADR (`spire/keys_<TS>.json`, journal in MySQL) is refused for SPIRE. SPIRE no longer depends on MySQL for restores: the rule "restore MySQL before the SPIRE CA keys" is gone. The datastore is daily only (no journal archive): RPO 24 h, as the CA keys already were.

## Migration of an existing cluster (expand/contract, ADR-0040)

- **Upgrade.** The node agents are applied first (DaemonSet rolled by a pod template annotation, the agent ConfigMap has no hash suffix). The new server starts on an empty SQLite datastore and its own key file, so it creates a **new CA in the same trust domain** (`trading-model.local`) and publishes the new bundle to `spire-bundle`. Running workloads keep their SVIDs of the old CA, still valid and trusted by each other. About a minute later each agent sees the CA mismatch, bootstraps from the new bundle and re-attests; the `spire-entries` sidecar recreates the registration entries; workloads receive new SVIDs and bundle through the Workload API (spiffe-helper rewrites the files, the services reload them). Pods that start during that minute wait for their SVID. While agents switch, a workload holding the new bundle rejects a peer still on the old CA: a short window, during the release only.
- **Kept for N-1.** The MySQL `spire` database, `keys.json`, the spire-server → MySQL egress rule and the `spire-server` client of `mysql-network-policy` are not removed in this release, so `rollout undo` of the server returns to its MySQL datastore and old CA; the agents bootstrap back to it the same way.
- **Contract (a later release).** Drop the MySQL `spire` database, `keys.json`, and both network rules.

## Consequences

- MySQL is off the identity path: losing `mysql-0` no longer degrades mTLS. ADR-0020 still holds for ingestion (no failover).
- The SPIRE server stays a single point. Its outage is covered by the 4 h TTL (about 2 h of margin) and the restore of its tar; HA would need a shared datastore (a real MySQL failover), not taken here.
- A leaked SVID stays valid up to 4 h instead of 1 h. Accepted: SVIDs never leave the pods, and the gain in recovery time is the point of this decision.
- The datastore snapshot holds only public material (bundle, journal of certificates, entries); the CA private keys are in the same encrypted tar, as before.

## Alternatives Considered

- **A dedicated MySQL instance for SPIRE.** Removes the coupling with market data but adds a database to run, back up, monitor and secure, and stays a single point.
- **SPIRE HA on a real MySQL failover (InnoDB Cluster / operator).** Also gives ingestion a failover; an infrastructure project of its own, to be decided separately.
- **Only a longer TTL.** Buys time but keeps the dependency on `mysql-0`: rejected by the audit.
- **Copy the MySQL datastore into SQLite to keep the CA.** SPIRE has no datastore migration tool; converting tables by hand is fragile. The one-time CA change is absorbed by the agents' rebootstrap.
