# Redis and Sentinel TLS (issue #768)

Server certificate issued by **cert-manager** (same chain as [MySQL](./MYSQL_TLS.md)); clients verify it. Clients authenticate with their ACL password, not a certificate (ADR-0047). cert-manager is a cluster prerequisite.

## Why two steps

Sentinel announces one port per master, the one of `sentinel monitor`. With `tls-replication yes` that port must be the TLS one, and a client of release N-1 (no TLS) following it would fail. So the switch is a flag, `REDIS_TLS_MODE`, flipped in two releases (expand/contract, ADR-0040):

| Mode | Release | Redis / Sentinel | Clients |
|---|---|---|---|
| `optional` | N (this one) | clear text `6379` / `26379` and TLS `6380` / `26380`; replication and Sentinel in clear text, Sentinel announces `6379` | know TLS (`REDIS_TLS_CA`) but stay in clear text |
| `required` | N+1 | `port 0`, `tls-replication yes`, Sentinel `port 0` and `tls-port`, `sentinel monitor … 6380` | `REDIS_TLS_MODE=required`, `REDIS_SENTINELS` on `26380` |

Until N+1 the client traffic of Redis stays in clear text, so the `docs/compliance/*` line is **not** corrected yet (issue #768 stays open for it).

## What exists

| Object | Role |
|---|---|
| Issuer `redis-selfsigned`, Certificate `redis-ca` (5 years), Issuer `redis-ca` | internal CA |
| Certificate `redis-tls` (90 days, renewed 30 days before, new key each time) → Secret `redis-tls` | SANs `redis`, `redis-headless`, `*.redis-headless`, `redis-sentinel-headless`, `*.redis-sentinel-headless`, `localhost`, `127.0.0.1` |

Nodes are reached by the IP Sentinel announces, which no certificate lists: clients set `servername` to `redis` (`REDIS_TLS_SERVERNAME`), and Node checks that name, so the chain and the name are both verified. The pods mount the whole Secret; the exporter sidecars and the services mount `ca.crt` only.

## Switch to `required` (release N+1)

1. Check release N runs everywhere (`kubectl get pods`, no N-1 pod left).
2. In `redis.yaml` set `REDIS_TLS_MODE=required` on both StatefulSets; in the three `*.properties` set `REDIS_TLS_MODE=required` and the sentinel ports to `26380`; exporters: `REDIS_ADDR=rediss://127.0.0.1:6380` / `26380`.
3. Deploy. Pods roll one at a time; Redis-backed features run degraded during the roll, as for ADR-0047.
4. Correct the Redis line of `docs/compliance/*`, run `bun run compliance:check`, close #768. `tests/k8s/run-kind.sh verify_redis_tls` expects a clear connection to be refused exactly in `required`.

## Rotation

cert-manager renews the leaf 30 days before the end and the kubelet refreshes the Secret, but Redis and Sentinel read the files at start only. Inside that 30-day window run `kubectl rollout restart statefulset/redis statefulset/redis-sentinel` (one pod at a time, failover as usual). Not automated: no reload sidecar, because a restart is already a documented operation here. CA renewal (every ~4 years): restart the services too (they read `ca.crt` at start); the gap is like the MySQL one. Not rehearsed in CI.

## Not covered

MongoDB TLS is #769. Compose Redis stays plain (dev).
