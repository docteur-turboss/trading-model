# Runbook: Database Failover

What each database does when a pod, a node or a volume is lost, and how to
bring it back. Restores always go through the encrypted backups (`*.age`) and
`scripts/restore-k8s.sh`; the full procedure is in
[BACKUP_DR.md, Restore Procedures](../../deployment/BACKUP_DR.md#restore-procedures).
Never restore a plaintext dump by hand, never point a service at another
database host.

| Database | K8s topology ([ADR-0020](../../adr/0020-database-topology-as-deployed.md)) | Failover |
| --- | --- | --- |
| MySQL (market data) | StatefulSet `mysql`, Service `mysql-primary` pinned to pod `mysql-0` | **none** |
| SPIRE server (SQLite datastore + CA keys, [ADR-0062](../../adr/0062-spire-datastore-sqlite-and-4h-svid-ttl.md)) | Deployment `spire-server`, 1 replica, PVC `spire-server-data` | **none** (SVIDs stay valid about 2 h after it stops) |
| MongoDB DLQ | StatefulSet `mongo-dlq`, replica set `rs0`, database `dlq` | automatic (replica set) |
| MongoDB audit trail | StatefulSet `mongo-audit`, replica set `rs0-audit`, database `audit` | automatic (replica set) |
| Redis | StatefulSets `redis` + `redis-sentinel` | automatic (Sentinel) |

## Before any restore

- You need an age private key that decrypts the backups (operator key, or the
  escrow key from the safe:
  [Key custody](../../deployment/ENCRYPTION_AT_REST.md#key-custody)). Check it
  on the backup first: `bash scripts/verify-backup-key.sh --identity <key file> --dir <backup dir>`.
- `restore-k8s.sh` needs namespace admin rights (exec into the databases,
  scale the SPIRE server, create a helper pod).
- Stop the writers of the database you restore: a restore next to live
  writers collides with their inserts, and a point-in-time replay fails on a
  duplicate key.
- Point-in-time recovery (RPO 1 h, last 72 h, ADR-0031): add
  `--until <instant>` (state just before it). The script checks the dump,
  checksums and archive chain of every component first and touches nothing
  (exit 1) on a gap or archives that stop before the instant.
- Where the restore runs. The commands of this runbook are written for the
  workstation case below (`BACKUP_DIR=./restore`); `BACKUP_DIR` defaults to
  `/backups`, which only exists in a pod that mounts `backup-data`.
  - **Workstation** (default here): fetch a run, still encrypted, from the
    off-site bucket with `scripts/fetch-offsite.sh` (add `--pitr` for
    `--until`) into `./restore`, then run `restore-k8s.sh` with
    `BACKUP_DIR=./restore`
    ([BACKUP_DR.md, From the off-site bucket](../../deployment/BACKUP_DR.md#from-the-off-site-bucket)).
    This is also the only way once the volume or the cluster is lost.
  - **In the cluster, next to `backup-data`**: a `backup-tools` pod mounting
    it at `/backups`, the key passed on stdin with `kubectl exec -i … < ~/backup-key.txt`
    and the same `restore-k8s.sh` options. No manifest ships for this pod
    ([BACKUP_DR.md, Kubernetes](../../deployment/BACKUP_DR.md#kubernetes-1)).
- `--until` on `mysql` replays the binlogs with `mysqlbinlog`, which the
  script runs locally: run it from the `backup-tools` image or a workstation
  with `mysqlbinlog` installed (the script refuses otherwise, before touching
  any data).

```bash
# Off-site: credentials of the Secret trading-model-backup-s3
bash scripts/fetch-offsite.sh --dest ./restore --pitr
BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
  bash scripts/restore-k8s.sh --until 2026-11-03T13:45:00Z --components <components>
```

`fetch-offsite.sh` prints the `restore-k8s.sh` command for the run it fetched.
Without `--until`, `restore-k8s.sh` takes the newest run whose manifest lists
each component (checksum verified), or the run given by `--timestamp`.

## MySQL

**Alerts:** `ServiceDown` on `financial-scraper` with MySQL connectivity
errors, `MarketDataStale`  
**Severity:** SEV1

There is **no MySQL failover** (ADR-0020). Every client (financial-scraper,
financial-scraper-collector, migration and retention Jobs) writes through
`mysql-primary`, whose selector is the pod `mysql-0`. `mysql-1` and `mysql-2`
are not members of the replication group and hold no data: never point a
client at them. Losing `mysql-0` stops market data ingestion
(financial-scraper, financial-scraper-collector).

It no longer touches workload identity: the SPIRE server keeps its datastore
in SQLite on its own volume ([ADR-0062](../../adr/0062-spire-datastore-sqlite-and-4h-svid-ttl.md)).
SVIDs keep being issued and pods restarted meanwhile get their identity
(checked by `tests/k8s/run-kind.sh`, step `verify_identity_without_mysql`).

### Symptom check

```bash
kubectl get pod -n trading-model mysql-0 -o wide          # status and node
kubectl get pvc -n trading-model mysql-data-mysql-0
kubectl logs -n trading-model mysql-0 -c mysql --tail=50
kubectl exec -n trading-model mysql-0 -c mysql -- \
  sh -c 'mysqladmin ping -h localhost -u root -p"$MYSQL_ROOT_PASSWORD"'
kubectl logs -n trading-model deployment/financial-scraper -c financial-scraper --tail=20 | grep -i "mysql\|database"
```

### Loss of `mysql-0` (pod or node)

RTO is the time to bring `mysql-0` back with its volume, or to restore the
last backup (ADR-0020).

1. **Pod crashed, node healthy:** the StatefulSet recreates `mysql-0` on the
   same PVC `mysql-data-mysql-0`. Wait for it to be ready
   (`kubectl wait -n trading-model --for=condition=Ready pod/mysql-0 --timeout=300s`).
   Deleting the pod (`kubectl delete pod -n trading-model mysql-0`) is a full
   outage of ingestion while it restarts: only do it when the pod is already
   unusable.
2. **Node lost:** the pod stays `Terminating` or `Unknown` and is not
   rescheduled until Kubernetes knows the node is gone. Once you are sure the
   node is down (not only partitioned: two `mysql-0` on one volume corrupt it),
   delete the node object or force-delete the pod
   (`kubectl delete pod -n trading-model mysql-0 --grace-period=0 --force`).
   The pod comes back on another node only if the volume can attach there
   (same zone for zonal block storage).
3. **Volume lost or corrupted:** restore, step below.
4. Once `mysql-0` is ready, check that financial-scraper ingests again
   ([runbook-market-data-stale](runbook-market-data-stale.md)).

### MySQL volume lost or corrupted: restore

1. Stop the MySQL writers:
   ```bash
   kubectl scale deployment -n trading-model financial-scraper financial-scraper-collector --replicas=0
   ```
2. If the volume is gone, let `mysql-0` start on a new empty PVC (delete the
   broken PVC `mysql-data-mysql-0` and the pod) and wait for it to be ready.
3. Restore MySQL:
   ```bash
   BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
     bash scripts/restore-k8s.sh --components mysql
   # or point in time (fetch-offsite.sh --pitr, mysqlbinlog needed)
   BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
     bash scripts/restore-k8s.sh --until <instant> --components mysql
   ```
4. Scale the writers back to the replica counts of the overlay:
   ```bash
   kubectl scale deployment -n trading-model financial-scraper financial-scraper-collector --replicas=<overlay replicas>
   ```

The dump also holds the `spire` database of the releases before ADR-0062.
Nothing reads it any more except a rollback of the SPIRE server to such a
release; it goes away with the contract step of ADR-0062.

## SPIRE server

**Alerts:** `CertificateExpiry` (an SVID with less than 1 hour left),
workloads failing mTLS, pods stuck without SVID  
**Severity:** SEV1

One replica (`strategy: Recreate`), SQLite datastore and CA keys
(`datastore.sqlite3`, `keys-sqlite.json`) on the RWO PVC `spire-server-data`
([ADR-0062](../../adr/0062-spire-datastore-sqlite-and-4h-svid-ttl.md)).
SVIDs live 4 hours and are renewed at half-life: once the server stops,
running workloads keep valid SVIDs for about 2 more hours. That is the
recovery window. Pods started meanwhile get no identity.

1. **Pod crashed:** the Deployment recreates it on the same volume. Check
   `kubectl exec -n trading-model deployment/spire-server -c spire-server -- /opt/spire/bin/spire-server healthcheck -socketPath /run/spire/server-sockets/api.sock`.
2. **Node lost:** as for `mysql-0`, the pod comes back once the node is known
   gone and the volume can attach elsewhere.
3. **Volume lost or corrupted:** restore the datastore and CA keys of the
   last run (the script stops the server, writes both files, starts it and
   runs its healthcheck):
   ```bash
   BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
     bash scripts/restore-k8s.sh --components spire
   ```
   The trust bundle comes back unchanged. If the server already started a new
   CA on an empty volume, the SPIRE agents notice the change and bootstrap
   again from the `spire-bundle` ConfigMap within about a minute
   (`rebootstrap_mode`); `kubectl -n trading-model-node rollout restart daemonset/spire-agent`
   does it at once. A workload that still rejects its peers holds an SVID of
   the other CA: restart its pod.
4. **No usable backup:** delete the PVC and let the server start empty. It
   creates a new CA in the same trust domain, the `spire-entries` sidecar
   recreates the entries and the agents bootstrap again; restart the
   workloads that keep failing mTLS.

## MongoDB (DLQ and audit trail)

**Alerts:** `ServiceDown` on `dlq-service` or `audit-logger`,
`AuditChainBroken` after a restore  
**Severity:** SEV1

Two separate replica sets: `mongo-dlq-*` (dlq-service) and `mongo-audit-*`
(audit-logger). Losing one member is absorbed by the election.

### Symptom check

```bash
# Replace mongo-dlq by mongo-audit for the audit trail
kubectl exec -n trading-model mongo-dlq-0 -c mongodb -- mongosh --quiet --eval "rs.status().members.map(m => m.name + ' ' + m.stateStr)"
kubectl exec -n trading-model mongo-dlq-0 -c mongodb -- mongosh --quiet --eval "db.hello().primary"

# Services see their database (client SVID)
kubectl exec -n trading-model deployment/dlq-service -c dlq-service -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/health/ready
kubectl exec -n trading-model deployment/audit-logger -c audit-logger -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/health/ready
```

### No primary elected

```bash
# Ask the current primary to step down
kubectl exec -n trading-model mongo-dlq-0 -c mongodb -- mongosh --quiet --eval "rs.stepDown()"

# A member that will not come back: remove it, add it again once it is rebuilt
kubectl exec -n trading-model mongo-dlq-0 -c mongodb -- mongosh --quiet --eval "rs.remove('mongo-dlq-2.mongo-dlq-headless:27017')"
kubectl exec -n trading-model mongo-dlq-0 -c mongodb -- mongosh --quiet --eval "rs.add('mongo-dlq-2.mongo-dlq-headless:27017')"
```

Run these against the primary (or, with no primary, a member that sees the
majority). Same commands for `mongo-audit-*` with `mongo-audit-headless`.

### Full data loss: DLQ

1. Stop the writer: `kubectl scale deployment -n trading-model dlq-service --replicas=0`.
   message-manager keeps the dead letters it cannot send in its local file
   ([runbook-message-bus-outage](runbook-message-bus-outage.md)): do not
   delete its pods meanwhile.
2. Restore the `dlq` database only (component `mongodb` holds both replica
   sets; `--ns` leaves the audit trail untouched):
   ```bash
   BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
     bash scripts/restore-k8s.sh --components mongodb --ns 'dlq.*'
   ```
   `--ns` skips the oplog replay (data as of the start of the dump) and is
   refused with `--until`. To restore one collection without overwriting
   healthy writes, or into a scratch database, see
   [BACKUP_DR.md, Restoring part of MongoDB](../../deployment/BACKUP_DR.md#restoring-part-of-mongodb---ns---into-scratch).
   There is no point-in-time restore of the DLQ alone: `--until` with
   component `mongodb` also rewinds the audit trail and loses every audit
   event written after the instant. Never use it for a DLQ loss; if the
   audit trail is lost too, follow the audit section below.
3. Scale dlq-service back, then list the dead letters (`/dlq` needs the
   HMAC signature on top of mTLS: `examples/manage-dlq.sh` signs it and goes
   through the edge-proxy, which calls the gateway with its SVID):
   ```bash
   kubectl port-forward -n trading-model svc/edge-proxy 8449:8080 &
   API_GATEWAY=http://localhost:8449 ADMIN_TOKEN=<AUTH_TOKENS value> \
     DLQ_AUTH_HMAC_SECRET=<dlq-service secret> bash examples/manage-dlq.sh
   ```

### Full data loss: audit trail (`mongo-audit`)

The audit trail is a hash chain anchored in S3 (ADR-0027). Never edit
`audit_events` or `audit_chain_state` by hand, and never restore part of
`audit.*` in place (`restore-k8s.sh` refuses it: use `--into-scratch` to
inspect).

1. Stop the writer: `kubectl scale deployment -n trading-model audit-logger --replicas=0`.
2. Restore the audit replica set alone:
   ```bash
   BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
     bash scripts/restore-k8s.sh --components mongodb-audit
   # point in time (fetch-offsite.sh --pitr: PITR archives of mongodb-audit)
   BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
     bash scripts/restore-k8s.sh --until <instant> --components mongodb-audit
   ```
   Older than the daily tier: `fetch-offsite.sh --tier weekly|monthly --components mongodb-audit`.
3. Scale audit-logger back. `AuditChainBroken` fires when anchors were
   written after the restored point: those events are lost. Once the restore
   is explained, acknowledge the loss with `chain-cli.js acknowledge-loss`, as
   in [runbook-audit-chain-broken, After a restore from an older backup](runbook-audit-chain-broken.md#after-a-restore-from-an-older-backup),
   and escalate to compliance.

### After a MongoDB or MySQL restore

```bash
# Read-only business checks: audit chain, dead letters, market_candles, SPIRE entries and bundle
K8S_NAMESPACE=trading-model bash scripts/verify-restore-k8s.sh
```

Exit 1 on any KO
([BACKUP_DR.md, Recovery Verification](../../deployment/BACKUP_DR.md#recovery-verification)).

## Redis Failover

**Alert:** Multiple services showing degraded performance  
**Severity:** SEV1-SEV2

### Symptom Check

```bash
# Any pod of the Redis HA group can be master: find the current one
REDIS_MASTER=$(for p in redis-0 redis-1 redis-2; do
  [ "$(kubectl exec -n trading-model "$p" -- redis-cli --raw ROLE | head -n 1)" = master ] && echo "$p"
done)
kubectl exec -n trading-model "$REDIS_MASTER" -- redis-cli ping

# Check sentinel status
kubectl exec -n trading-model redis-sentinel-0 -- redis-cli -p 26379 sentinel masters
```

### Recovery

Redis Sentinel should auto-failover. If not:

```bash
# Force sentinel failover
kubectl exec -n trading-model redis-sentinel-0 -- redis-cli -p 26379 sentinel failover mymaster
```

### Full Redis data loss

Redis is not backed up (derived state). It rebuilds from AOF/RDB on restart.
If persistence is corrupted:

1. Clear Redis data:
   ```bash
   kubectl exec -n trading-model "$REDIS_MASTER" -- redis-cli FLUSHALL
   ```
2. Services will reconnect and rebuild cache
3. Monitor message-manager for backpressure during rebuild

## Total outage or lost cluster

Follow [BACKUP_DR.md, Recovery Steps for Total Outage](../../deployment/BACKUP_DR.md#recovery-steps-for-total-outage)
(SealedSecrets keys first, then `fetch-offsite.sh`, then MongoDB, MySQL,
the SPIRE datastore and CA keys, checkpoints).

## Tested by

The CI job `k8s` (`tests/k8s/run-kind.sh`) runs this restore path on kind:
backup, data destroyed (audit and DLQ databases, `market_candles`, SPIRE
volume), run fetched off-site by `tests/k8s/restore-runner.yaml`
(`fetch-offsite.sh --pitr`, no `backup-data` mount), `restore-k8s.sh --until`,
then the checks of `verify-restore-k8s.sh`
([BACKUP_DR.md, Backup Verification](../../deployment/BACKUP_DR.md#backup-verification-cicd)).
The same job stops every MySQL pod (`mysql-0` included) and checks that the
SPIRE server restarts and a restarted pod gets an SVID
(`verify_identity_without_mysql`). The rescheduling of `mysql-0` on another
node is not drilled.

## Post-Recovery

- [ ] Verify all services show healthy
- [ ] Run E2E smoke tests
- [ ] Check Prometheus alerts resolve (all targets `up` means mTLS works)
- [ ] Audit trail restored: loss acknowledged, compliance informed
- [ ] Document root cause
- [ ] Update backup retention if needed
