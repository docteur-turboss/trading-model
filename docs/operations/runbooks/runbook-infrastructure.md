# Runbook: Infrastructure (pods, nodes, volumes, databases)

**Alerts:** `KubePodCrashLooping`, `KubeContainerOOMKilled`,
`KubePersistentVolumeFillingUp`, `NodeFilesystemAlmostFull` (warning);
`MySQLDown`, `RedisDown`, `RedisSentinelQuorumLost`, `MongoDBDown`,
`MongoDBReplicaSetNoPrimary` (critical); `RedisReplicasMissing`,
`MongoDBReplicaSetMemberUnhealthy` (warning).

## Where the metrics come from

ADR-0056. Prometheus scrapes, in K8s:

| Job | Source | Metrics |
| --- | --- | --- |
| `kube-state-metrics` | Deployment `kube-state-metrics`, own namespace only (Role) | `kube_pod_*`, `kube_statefulset_*`, `kube_deployment_*`, `kube_persistentvolumeclaim_*` |
| `kubelet`, `cadvisor` | kubelet of each node, port 10250 (ClusterRole `prometheus-nodes`: `nodes/metrics`) | `kubelet_volume_stats_*`, `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`, `container_spec_memory_limit_bytes`, `container_oom_events_total` |
| `node-exporter` | DaemonSet in `trading-model-node`, port 9100 of each node | `node_*` |
| `mysql`, `mongo-dlq`, `mongo-audit`, `redis`, `redis-sentinel` | exporter sidecar of each database pod (port `metrics`) | `mysql_*`, `mongodb_*`, `redis_*` |

Compose scrapes `mysqld-exporter`, `mongodb-exporter`, `redis-exporter` and
`node-exporter` (on Docker Desktop: the disks of the Docker VM and the Windows drives). The rules on
`kube_*`, `kubelet_*` and Sentinel have no data there.

An exporter that cannot log in reports its database down: `MySQLDown` and
`RedisDown` also fire when the `exporter` user is missing or has another
password. Look at the exporter logs first:

```bash
NS=trading-model
kubectl -n $NS logs mysql-0 -c mysqld-exporter --tail=20     # "Access denied" = user
kubectl -n $NS logs redis-0 -c redis-exporter --tail=20      # "WRONGPASS" = user
kubectl -n $NS logs mongo-dlq-0 -c mongodb-exporter --tail=20
```

The users come from the keys `MYSQL_EXPORTER_PASSWORD` and
`REDIS_EXPORTER_PASSWORD` of `trading-model-secrets`
([sealed-secrets.md](../../deployment/sealed-secrets.md#adding-one-key-to-an-existing-sealedsecret)):
MySQL user created by Job `db-migrate-user` (runs at every deploy), Redis user
by `redis-ha.sh` when the pod starts (`kubectl -n $NS rollout restart
statefulset/redis statefulset/redis-sentinel` after adding the key).

### Kubelet TLS (issue #851)

Production verifies the kubelet serving certificate against the cluster CA
(`ca_file` of the ServiceAccount, key `kubelet-scrape.yml` of ConfigMap
`prometheus-config`). Each node needs `serverTLSBootstrap: true` in its
kubelet config, and the `kubernetes.io/kubelet-serving` CSRs approved
(`kubectl get csr`, `kubectl certificate approve <name>`). Without it the
`kubelet` and `cadvisor` targets are down (`x509: certificate signed by unknown
authority`). The staging overlays replace that key and keep
`insecure_skip_verify: true` (kind signs the certificates itself).


## KubePodCrashLooping

A container of the namespace has been in `CrashLoopBackOff` for 5 minutes.

```bash
kubectl -n $NS get pods | grep -v Running
kubectl -n $NS describe pod <pod> | sed -n '/Last State/,/Ready/p'
kubectl -n $NS logs <pod> -c <container> --previous --tail=100
```

- Exit after a configuration error (missing env var, Secret key, ConfigMap):
  fix the overlay or the Secret, then `kubectl -n $NS rollout restart`.
- Dependency down at startup (MySQL, Redis, discovery-server): fix it first,
  the pod recovers by itself.
- Bad release: roll back
  ([runbook-deployment-failure](runbook-deployment-failure.md)).
- Service pods: also [runbook-service-down](runbook-service-down.md).

## KubeContainerOOMKilled

A container was killed for exceeding its memory limit and restarted in the
last 15 minutes. `HighMemoryUsage` only sees the V8 heap of the services: a
database, an exporter or native memory shows up here only.

```bash
kubectl -n $NS describe pod <pod> | grep -A5 "Last State"
# Memory against the limit over the last day (Grafana or Prometheus):
#   container_memory_working_set_bytes{pod="<pod>",container="<container>"}
#   container_spec_memory_limit_bytes{pod="<pod>",container="<container>"}
```

Repeated kills: raise `resources.limits.memory` of that container in its
manifest (or the overlay), and look for the cause (growing cache, large
query, leak) in the service logs. A single kill after a load peak: watch.

## KubePersistentVolumeFillingUp

A PVC is more than 80% full for 15 minutes (`kubelet_volume_stats_*`; volumes
whose driver reports no statistics, such as `local-path` on kind, are not
seen).

```bash
kubectl -n $NS get pvc
kubectl -n $NS exec <pod> -- df -h <mount path>
```

- `mysql-data-*`: market data grows; check that `db-retention` runs
  ([BACKUP_DR](../../deployment/BACKUP_DR.md#retention-job)), then grow the
  volume.
- `mongo-*-data-*`, `redis-data-*`: grow the volume; for Redis also check the
  journal backlog ([runbook-message-bus-outage](runbook-message-bus-outage.md#7-journal-backlog-of-a-subscriber)).
- `prometheus-data-*`, `loki-*`: retention (Prometheus 30 days) or volume size.
- `backup-data`: `BackupVolumeFilling` covers it ([BACKUP_DR](../../deployment/BACKUP_DR.md#monitoring)).

Grow a volume when its StorageClass allows it (`allowVolumeExpansion: true`):
`kubectl -n $NS patch pvc <pvc> -p '{"spec":{"resources":{"requests":{"storage":"<size>"}}}}'`,
then raise the `volumeClaimTemplates` size in the manifest for new pods.

## NodeFilesystemAlmostFull

A node disk (label `device`, one alert whatever its mount points) has less
than 15% free for 15 minutes. Past the kubelet eviction threshold, pods are
evicted. On a Docker Desktop compose host the Windows drives show up as 9p
devices (`C:\`): the Docker disk image lives on C: and never shrinks, and a
full C: froze the whole VM (2026-10-28).

```bash
kubectl get nodes
kubectl describe node <node> | grep -A8 Conditions      # DiskPressure
# Compose host:
docker system df
```

Free space: unused images (`crictl rmi --prune` on the node, `docker image
prune` on a compose host), leftover stacks and kind clusters (AGENTS.md),
old logs. Then grow the disk if the usage is real.

## MySQLDown

`mysql_up == 0` for 5 minutes on a member: its exporter cannot query MySQL.

1. Exporter login (see above): `Access denied for user 'exporter'` means the
   user or its password, not MySQL.
2. Otherwise MySQL itself:
   [runbook-database-failover#mysql](runbook-database-failover.md#mysql).

## RedisDown

`redis_up == 0` for 5 minutes on a data node (`job="redis"`) or a sentinel
(`job="redis-sentinel"`).

1. Exporter login (see above): `WRONGPASS` or `NOPERM` means the `exporter`
   ACL user (`redis-ha.sh`), not Redis.
2. Otherwise:
   [runbook-database-failover#redis-failover](runbook-database-failover.md#redis-failover).

## RedisReplicasMissing

The master has fewer connected replicas than the `redis` StatefulSet minus
one, for 5 minutes. Redis still serves, but a failover has fewer candidates
and the message journal (ADR-0048) fewer copies.

```bash
kubectl -n $NS get pods -l app.kubernetes.io/component=redis
kubectl -n $NS exec redis-0 -c redis -- sh /scripts/redis-ha.sh probe server && echo ok
kubectl -n $NS logs redis-1 -c redis --tail=50       # a replica that cannot sync
```

A replica pod not running: see `KubePodCrashLooping` / `KubePersistentVolumeFillingUp`.
A replica running but not connected: its log shows the sync error (master
unreachable, `masterauth`, disk full); `kubectl -n $NS delete pod <pod>` lets
`redis-ha.sh` find the master again.

## RedisSentinelQuorumLost

No sentinel can reach the quorum (`SENTINEL CKQUORUM`) for 5 minutes: the next
master failure is not failed over. Environments with fewer than 2 sentinels
(staging) never fire.

```bash
kubectl -n $NS get pods -l app.kubernetes.io/component=redis-sentinel
kubectl -n $NS logs redis-sentinel-0 -c sentinel --tail=50
```

Bring the missing sentinels back (pods, node, NetworkPolicy on 26379). Ghost
sentinels left by IP changes count as voters: `redis-ha.sh` gives each pod a
stable id, a restart of the StatefulSet clears them
([runbook-database-failover#redis-failover](runbook-database-failover.md#redis-failover)).

## MongoDBDown

`mongodb_up == 0` for 5 minutes: the exporter sidecar cannot reach `mongod` on
`127.0.0.1:27017` of its pod (no user involved: MongoDB runs without
authentication, ADR-0056). The `mongod` container is down, restarting or
stuck: [runbook-database-failover#mongodb-dlq-and-audit-trail](runbook-database-failover.md#mongodb-dlq-and-audit-trail).

## StatefulSetStuckOnOldRevision

`status.currentRevision` differs from `status.updateRevision` for 24 hours: the
pods run an older pod template than the one applied. On `staging-local` this is
the `partition: 1` of issue #700 (a deploy never restarts the data pods), so
new sidecars such as the exporters do not run and `MySQLDown`, `RedisDown` and
`MongoDBDown` stay silent.

```bash
kubectl -n $NS get sts -o custom-columns=NAME:.metadata.name,CUR:.status.currentRevision,UPD:.status.updateRevision
```

Do the planned restart of the section "Database pods across releases" of
[STAGING_LOCAL](../../deployment/STAGING_LOCAL.md#database-pods-across-releases).
Elsewhere (no partition), the rollout is blocked: look at the pod events.

## MongoDBReplicaSetMemberUnhealthy

A member of `mongo-dlq` or `mongo-audit` (label `member_idx`) is unreachable or
neither primary nor secondary (`RECOVERING`, `STARTUP2`, `DOWN`...) for 5
minutes. The set still has a majority, one more failure takes it away.

```bash
kubectl -n $NS exec mongo-dlq-0 -c mongodb -- mongosh --quiet --eval \
  'rs.status().members.map((m) => [m.name, m.stateStr, m.health, m.lastHeartbeatMessage])'
```

A member far behind (`RECOVERING`, oplog too short) must resync: follow
[runbook-database-failover#mongodb-dlq-and-audit-trail](runbook-database-failover.md#mongodb-dlq-and-audit-trail).

## MongoDBReplicaSetNoPrimary

No member of the replica set reports `PRIMARY` for 2 minutes: writes fail
(audit events for `mongo-audit`, dead letters for `mongo-dlq`). Follow
[runbook-database-failover#no-primary-elected](runbook-database-failover.md#no-primary-elected).
For `mongo-audit`, check the audit chain afterwards
([runbook-audit-chain-broken](runbook-audit-chain-broken.md)).
