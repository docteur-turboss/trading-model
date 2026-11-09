# ADR-0058: MongoDB Authentication: keyFile, One User per Client, Switch in Two Releases

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0056](./0056-infrastructure-metrics-exporters.md) (§4: the `exporter` user it deferred), [ADR-0047](./0047-redis-isolation-per-service.md) (same model for Redis), [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) and [ADR-0050](./0050-audit-chain-single-writer-lease.md) (the audit trail this protects), [ADR-0031](./0031-point-in-time-recovery-hourly-archives.md) (oplog archives), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand / contract)
**Verified by:** `packages/persistence/tests/db/mongo-users.db.spec.ts`, `packages/persistence/tests/unit/mongo-connection-manager.spec.ts`, `tests/backup/compose-restore-drill.sh`, `tests/k8s/check-overlays.mjs`

## Context

MongoDB ran without authentication in K8s (`mongo-dlq`, `mongo-audit`) and in compose. Any client reaching port 27017 had every right, including on the audit trail (`audit_events`, `audit_chain_state`, `audit_chain_lease`) and on the dead letters. Only the NetworkPolicies limited who could connect. ADR-0056 §4 ran the `mongodb_exporter` sidecars without a user for that reason and deferred the `clusterMonitor` user to this decision (issue #669, validated by the owner on 2026-11-08).

## Decision

1. **Internal authentication.** Each replica set has a `keyFile` (Secret keys `MONGO_DLQ_KEYFILE`, `MONGO_AUDIT_KEYFILE` of `trading-model-secrets`). mongod refuses a keyFile readable by its group, and the data volume's `fsGroup` adds group read to a mounted Secret file, so an init container copies the key from an environment variable to a `0400` file of an in-memory `emptyDir`, owned by the mongod user (Pod Security `restricted`, no root).
2. **One user per client**, all in `admin` (clients connect with `authSource=admin`), created by `deploy/mongo/users.js`:

   | User | Roles | Used by | Password key |
   | ---- | ----- | ------- | ------------ |
   | `audit-logger` | `readWrite` on `audit` (compose: `audit-logger`) | audit-logger | `MONGO_AUDIT_PASSWORD` |
   | `dlq-service` | `readWrite` on `dlq` | dlq-service | `MONGO_DLQ_PASSWORD` |
   | `exporter` | `clusterMonitor` | `mongodb_exporter` sidecars | `MONGO_EXPORTER_PASSWORD` |
   | `backup` | `backup` | `mongodump`, hourly oplog archives (`scripts/backup-*.sh`) | `MONGO_BACKUP_PASSWORD` |
   | `root` | `root` | the restore (oplog replay needs every action), user administration | `MONGO_ROOT_PASSWORD` |

   `read` on `local` is not granted to the exporter: the collectors in use (`replSetGetStatus`, server status) need `clusterMonitor` only. The `backup` role reads the oplog (verified on the pinned image).
3. **Credentials of the services** come from `MONGO_USERNAME` / `MONGO_PASSWORD` (the password from the Secret), passed to the driver as the `auth` option, never in the URI, which is logged and sits in a ConfigMap. Both or none (`mongoAuthFromEnv`): unset means no authentication, for dev.
4. **Passwords in the pods.** The mongod container carries `MONGO_BACKUP_PASSWORD` and `MONGO_ROOT_PASSWORD`: backup and restore scripts run the tools inside the pod (`mongo_tool` in `backup-lib.sh`, `docker exec` in compose) and read the password there, so it appears in no CronJob, manifest, host script argument or log. Inside the pod the tools receive it as `--password` on their own command line (visible in `/proc/<pid>/cmdline` of that pod for the length of the dump); the pod is reachable only through `exec`, so this is accepted, and moving it to `--config` is a later hardening.
5. **Switch in two releases, no downtime** (expand / contract, like ADR-0040). Release N starts mongod with `--keyFile --transitionToAuth`: members authenticate each other, clients with or without credentials are accepted, so a rolling restart of the StatefulSets and of the services never breaks the set. The Jobs `mongo-dlq-users` / `mongo-audit-users` create the users (idempotent, re-run by every release, they apply a rotated password) while no authentication is required yet. Release N+1 removes `--transitionToAuth`: mongod enforces authentication. The audit chain is untouched: it is data, and the one writer on its head (ADR-0050) only changes its credentials; the 15 min verifier keeps running across both steps.
6. **A new cluster** must go through release N before N+1: users can only be created without credentials while `--transitionToAuth` is on (or from localhost). The Job fails with `Unauthorized` otherwise.
7. **Compose** runs one standalone mongod with `--auth`: the image creates `root` on an empty volume (`MONGO_INITDB_ROOT_*`), the one-shot `mongo-users` runs the same script for the others. All five passwords are required by compose (`:?`).
8. **Secrets.** The seven keys are required by `deploy.yml` before any change (like the Redis keys of ADR-0047), drawn by `init-sealed-secrets.sh`, present in `tests/k8s/ci-render.mjs` and documented in `docs/deployment/ENV.md` and `sealed-secrets.md`.

## Consequences

- Before the first deploy of release N: seal the seven keys into `trading-model-secrets` (merge, never `init-sealed-secrets.sh` on a live cluster: it draws new values for every key, `docs/deployment/sealed-secrets.md`). Compose hosts add the five passwords to `.env` and either recreate the Mongo volume or create `root` through the localhost exception (comment of the `mongo` service).
- Release N restarts both StatefulSets one pod at a time (keyFile, flags). Until the Job has run, the exporters and the services started with credentials report authentication errors; they recover on their own.
- A leaked pod environment gives the `backup` and `root` passwords of the pod it belongs to: the pods are only reachable by `exec`, which already gave full access without authentication.
- `mongodump --oplog` and `mongorestore --oplogReplay` were run with these roles against a replica set with `keyFile` and `--transitionToAuth`, then against the same data directory with authentication enforced (anonymous: `Unauthorized`).
- The release N+1 change is one line per StatefulSet (the flag) and an `AGENTS.md` update.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| No authentication, NetworkPolicies only | A compromised pod allowed to reach Mongo can rewrite the audit trail |
| x.509 client authentication from the SPIRE SVIDs | MongoDB maps a certificate subject to a user, not a SPIFFE ID, and the SVIDs rotate hourly: more work, a possible later step |
| Enforce authentication in one release | A rolling restart mixes members with and without `keyFile` (the set breaks), and the services restart before their users exist |
| Credentials in the connection string | The URI is logged at start and stored in a ConfigMap |

## Limits

- Until release N+1, K8s mongod still runs with `--transitionToAuth`: a client without credentials keeps all rights. The "anonymous refused" and "`Unauthorized` outside the scope" checks on a replica set with a keyFile are only run by hand (see Consequences); `tests/k8s/run-kind.sh` checks `mongodb_up` and uses `root`, nothing more. The automated kind case for the enforced state ships with release N+1.
