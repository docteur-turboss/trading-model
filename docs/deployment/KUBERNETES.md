# Kubernetes Deployment Guide

## Overview

This guide covers deploying the Trading Model platform on Kubernetes. The K8s manifests are located in `deploy/k8s/` and are designed to be applied with `kubectl` or Kustomize.

## Prerequisites

- Kubernetes cluster 1.28+ (tested with AKS, EKS, GKE, k3s)
- `kubectl` configured with cluster access
- Ingress controller (nginx-ingress recommended)
- cert-manager for TLS certificate management
- Prometheus Operator (optional, for enhanced alerting)
- Default StorageClass for the ReadWriteOnce PVCs (MySQL, MongoDB, Redis,
  Prometheus, Grafana, Loki, SPIRE)
- A ReadWriteMany StorageClass named `rwx-csi` (NFS, EFS, Azure Files...) for
  the trainer checkpoints PVC (`trainer-checkpoints-pvc`)
- CRDs, installed before the first deploy (operators are not installed by the manifests):
  `verticalpodautoscalers.autoscaling.k8s.io` (VPA, recommendations only: `updateMode: "Off"`,
  the HPAs own CPU and memory scaling), `sealedsecrets.bitnami.com` (production), cert-manager
  (`ClusterIssuer` `letsencrypt-prod`) and an `IngressClass` named `nginx`
- `deploy.yml` derives these from the rendered overlay (`deploy/k8s/scripts/check-prereqs.sh`) and
  refuses, listing what is missing, before the first apply
- A CNI that enforces NetworkPolicies
- One environment per cluster: the node agents (SPIRE agent, promtail) serve a
  single application namespace
- Self-hosted nodes: data disk encrypted with LUKS2 + Clevis/Tang
  (`deploy/host/`, see [Encryption at Rest](ENCRYPTION_AT_REST.md))
- An age public key in the GitHub environment variable `BACKUP_AGE_RECIPIENTS`:
  the `db-backup` CronJob refuses to write unencrypted backups

## Directory Structure

```
deploy/k8s/
  base/                       # Kustomize base overlay
    namespace.yaml            # trading-model namespace (Pod Security: restricted)
    kustomization.yaml        # Resource list
  config/                     # <service>.properties -> hashed <service>-config ConfigMaps (+ HPA, PDB, NetworkPolicy, ServiceAccount)
  secrets/                    # Kubernetes Secrets (placeholder values)
  services/                   # Deployments + Services per microservice
  infra/                      # Infrastructure: MySQL, MongoDB, Redis, OTel, Jaeger, Prometheus, Grafana, Loki, SPIRE server
  node-agents/                # Namespace trading-model-node (privileged): SPIRE agent, SPIFFE CSI driver, promtail
  overlays/<env>/             # Application overlay per environment
  overlays/<env>/node-agents/ # Node agents pointed at that environment's namespace
  ingress/                    # Ingress rules: public API (→ edge-proxy), Grafana
  ingress/hosts/              # Component: copies overlays/<env>/ingress-hosts.yaml into the Ingress hosts
  monitoring/                 # PrometheusRules for alerting
  scripts/                    # deploy-k8s.sh, run-migrations.sh
```

## Quick Start

### 1. mTLS via SPIRE (default)

mTLS identities are issued by SPIRE (ADR-0011) — mandatory and enabled by
default in the base kustomization. Every workload runs a `spiffe-helper`
sidecar that writes its SVID into `/run/spire/svid`
(`svid.pem`, `svid_key.pem`, `bundle.pem`) and `TLS_*_PATH` points at those
files. No manual certificate generation or `trading-model-tls` secret is
required for services:

```bash
# 1. Node agents (SPIRE agent, SPIFFE CSI driver, promtail), once per cluster
kubectl kustomize deploy/k8s/overlays/staging/node-agents | kubectl apply -f -
# 2. Application overlay (jobs/ packages a script from outside its directory)
kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/k8s/overlays/staging | kubectl apply -f -
# 3. Schema (scripts/migrations) once MySQL is up
bash deploy/k8s/scripts/run-migrations.sh trading-model-staging
```

### Staging secrets, PDBs and access (issue #417)

- **Secrets:** staging reads a SealedSecret (`overlays/staging/sealed-secrets.yaml`, placeholders `AgCHANGE_ME` in git). Until a human seals it on the staging cluster with `OVERLAY=staging bash scripts/init-sealed-secrets.sh` (then commits the file), `deploy.yml` refuses to deploy staging ("placeholder SealedSecrets"). The CI `k8s` job replaces it with a Secret of public test values (`tests/k8s/ci-render.mjs`): kind has no controller.
- **PDBs:** every PodDisruptionBudget uses `maxUnavailable: 1` in staging (single replicas: `minAvailable: 2` would block `kubectl drain`). HPAs are pinned to 1 pod, so every RollingUpdate Deployment surges first (`maxUnavailable: 0`, `maxSurge: 1`, issue #699): `maxUnavailable: 1` would stop the only pod before its replacement is ready. `tests/k8s/check-overlays.mjs` fails on a Deployment that can run one pod with an effective `maxUnavailable` above 0.
- **Staging access:** both Ingresses carry `nginx.ingress.kubernetes.io/whitelist-source-range`, set in `overlays/staging/kustomization.yaml`. The committed value (`192.0.2.0/24`, TEST-NET-1) lets nobody in: replace it with the operators' CIDRs, comma separated.

The CI `k8s` job runs the same sequence on kind for release N-1 (the commit
before: the PR's base branch), upgrades it to N through the release steps of
`deploy.yml` (`deploy/k8s/scripts/deploy-release.sh`: images pinned by digest,
migrations, rollout, rollback), first with a forced failure that must roll every
Deployment back to N-1, and runs `migrate-down 1` then the migrations again; then the two gates of
`deploy.yml` (`deploy-k8s.sh smoke-test`, and the canary on api-gateway with
traffic through edge-proxy, which must also fail without traffic), and checks
the stack (`tests/k8s/run-kind.sh`). The `deploy.yml` workflow runs these steps (migrations go before the rollout,
or right after the overlay on a first deploy, when MySQL does not exist yet).

> **Public API path:** the nginx ingress controller (installed outside this
> repo) terminates TLS for the `api` host of the overlay (see
> [Set the Ingress hosts](#3-set-the-ingress-hosts)) and forwards plain
> HTTP to the `edge-proxy`, which calls the api-gateway over mTLS with its own
> SPIRE SVID ([ADR-0018](../adr/0018-temporary-frontend-removal.md)). The
> controller needs no client certificate, and no request reaches a service
> without going through the gateway (auth, rate limit per API client).
>
> **Controller prerequisites (personal data, register activity 6):** in
> ConfigMap `ingress-nginx-controller` set `disable-access-log: "true"` (the
> default format logs full caller IP, User-Agent and Referer to the node, with a
> retention and access nobody controls; `deploy/staging-local/bootstrap.sh
> prereqs` does it) and leave `use-forwarded-headers` unset, so the controller
> overwrites any `X-Forwarded-For` sent by the caller. The edge-proxy trusts that
> header only from the pod CIDR of each overlay (`realip.inc` next to its
> `kustomization.yaml`, merged into ConfigMap `edge-proxy-nginx`; set the
> production one to the cluster's real pod CIDR before the first deploy;
> `tests/k8s/realip.test.sh` checks trusted and untrusted peers) and logs the caller IP truncated (31 days in Loki). The
> controller's `error_log` keeps no request line but may show the peer IP: keep
> node log rotation at 7 days or less.
>
> **The controller must see the caller's address.** Behind a NodePort or a
> Docker port mapping with `externalTrafficPolicy: Cluster` the source is
> rewritten (SNAT): on staging-local the controller saw `10.244.0.1`, the node's
> bridge, for every caller, so the edge-proxy truncates that address, not the
> caller's. In production expose the controller with `externalTrafficPolicy:
> Local` or a load balancer that keeps the source (PROXY protocol needs
> `use-proxy-protocol`), and check once with a `curl` from a known address.
>
> **Rate limit at the edge.** `default.conf` applies `limit_req` (20 r/s per real
> client address, burst 60) and `limit_conn` (50) on `/v<n>/`, answering 429;
> `/ping` and `/health/ready` are not limited. The limit is per edge-proxy pod:
> the effective limit is 20 r/s × replicas (2 to 5), i.e. 40 to 100 r/s, never
> above the Ingress `limit-rps: 100` (`deploy/k8s/ingress/gateway-ingress.yaml`,
> per client address too): the edge limit is the tighter one for 1 to 5 replicas
> and the only one in compose. The gateway keeps its own `RATE_LIMIT_*` per
> client identity.

### 2. Configure secrets

Edit `deploy/k8s/secrets/` to set production values, then:

```bash
# Apply secrets (or use SealedSecrets/SOPS for production)
kubectl apply -k deploy/k8s/secrets/
```

For production, use SealedSecrets or an external secrets operator:

```bash
# Seals every production secret with the cluster's controller key (writes
# deploy/k8s/secrets/*-sealed.yaml; commit them). deploy.yml refuses to deploy
# production while a placeholder (AgCHANGE_ME...) is left.
bash scripts/init-sealed-secrets.sh
```

See [Sealed Secrets guide](sealed-secrets.md) for detailed setup, key rotation, and migration instructions.

Secrets are rotated by hand with `scripts/rotate-secrets.sh`; no CronJob does it. The former `secret-rotation` CronJob only restarted two Deployments and held write rights on every Secret (issue #424). `kubectl apply` without `--prune` does not remove it: `deploy.yml` deletes it after applying the overlay. On a cluster deployed by hand, delete it once (add `-n <namespace>`):

```bash
kubectl delete cronjob/secret-rotation role/secret-rotator-role \
  rolebinding/secret-rotator-binding serviceaccount/secret-rotator --ignore-not-found
```

### 3. Set the Ingress hosts

The base Ingresses ship `example.com` placeholders. Each overlay sets its
public host names once, in `deploy/k8s/overlays/<env>/ingress-hosts.yaml`
(keys `api` and `grafana`); the component `deploy/k8s/ingress/hosts` copies
them into the `rules` and `tls.hosts` of both Ingresses. That ConfigMap is
annotated `config.kubernetes.io/local-config`, so it is never applied.

`deploy.yml` (step "Check ingress hosts") refuses to deploy production while
the rendered overlay still contains `example.com`, before anything is applied:
cert-manager would keep failing Let's Encrypt orders for those names (rate
limits) and the API would have no external entry. Staging only gets a warning.
DNS records, cert-manager and the ingress controller stay outside this repo.

### 4. Deploy all resources

Staging and production deploy only through the `deploy.yml` workflow (digests, overlay, pre-checks: see [DEPLOY.md](DEPLOY.md)). `deploy-k8s.sh apply` applies the base with `:latest` tags and none of those checks, so it refuses any context but a local development cluster (`kind-*`, `k3d-*`, `minikube`, `docker-desktop`) and needs `ALLOW_DEV_APPLY=1`. Do not run `kubectl apply -k deploy/k8s/` on a shared cluster either.

```bash
# Local development cluster only
ALLOW_DEV_APPLY=1 ./deploy/k8s/scripts/deploy-k8s.sh apply

# Verify deployment
./deploy/k8s/scripts/deploy-k8s.sh status
```

### 5. Run smoke tests

```bash
./deploy/k8s/scripts/deploy-k8s.sh smoke-test
```

## Deployment Strategy

### Standard deployment

Run `deploy.yml`. `deploy-k8s.sh apply <service-name>` exists for local development clusters only (`ALLOW_DEV_APPLY=1`).

### Canary deployment

```bash
# Deploy to 10% of instances first, monitor, then full rollout
./deploy/k8s/scripts/deploy-k8s.sh canary <service-name> 10

# Several services: parallel, one observation window (what deploy.yml runs)
./deploy/k8s/scripts/deploy-k8s.sh canary-all <image-tag> 10 <service>...
```

### Rollback

```bash
# Rollback to previous version
./deploy/k8s/scripts/deploy-k8s.sh rollback <service-name>

# Rollback to specific revision
kubectl rollout history -n trading-model deployment/<service-name>
./deploy/k8s/scripts/deploy-k8s.sh rollback <service-name> <revision>
```

Several services or the schema: runbook
[Deployment Failure](../operations/runbooks/runbook-deployment-failure.md#full-cluster-rollback-multi-service-deployment)
and [Database Rollback](../operations/runbooks/runbook-deployment-failure.md#database-rollback).

## Scaling

### Autoscaling

HPAs are configured in `deploy/k8s/config/<service>-autoscaling.yaml` (`trader-trainer` has none: one fixed replica):

| Service               | Min | Max | Metric                           |
| --------------------- | --- | --- | -------------------------------- |
| discovery-server      | 3   | 10  | CPU 70%, Memory 75%              |
| message-manager       | 3   | 12  | CPU 65%, Memory 70%, Queue depth |
| api-gateway           | 2   | 8   | CPU 70%, Memory 75%              |
| financial-scraper     | 2   | 6   | CPU 70%, Memory 75%              |
| audit-logger          | 2   | 5   | CPU 70%                          |
| dlq-service           | 2   | 4   | CPU 70%                          |
| edge-proxy            | 2   | 5   | CPU 70%                          |

### Manual scaling

```bash
kubectl scale deployment -n trading-model <service-name> --replicas=5
```

## Capacity and cost

Computed from `kubectl kustomize deploy/k8s/overlays/production` (overlay patches
applied), commit `c967735d2`. Per-pod figures sum every container that declares
resources; `spiffe-helper` declares none and no LimitRange exists, so it is not counted.
Init containers, CronJobs, Jobs and the `trading-model-node` agents are not counted.

| Scenario    | CPU requests | Memory requests | CPU limits | Memory limits |
| ----------- | ------------ | --------------- | ---------- | ------------- |
| HPA minimum | 5.6 vCPU     | 10.2 GiB        | 26.0 vCPU  | 34.2 GiB      |
| HPA maximum | 9.7 vCPU     | 15.8 GiB        | 42.3 vCPU  | 45.5 GiB      |

Limits are rarely all reached; size nodes on the requests.

Recompute (per container; multiply by replicas, or the HPA min/max above, and sum):

```bash
kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/k8s/overlays/production \
  | kubectl create --dry-run=client --validate=false -o json -f - \
  | jq -r 'select(.kind|IN("Deployment","StatefulSet")) | .metadata.name as $n | .spec.replicas as $r
      | .spec.template.spec.containers[]
      | [$n,$r,.name,.resources.requests.cpu,.resources.requests.memory,.resources.limits.cpu,.resources.limits.memory] | @tsv'
```

Persistent volumes: **418 GiB**, in the same rendering (`volumeClaimTemplates` × replicas, plus PVC manifests).

| Component             | Volumes          | GiB |
| --------------------- | ---------------- | --- |
| Prometheus            | 2 × 50           | 100 |
| `backup-data`         | 1 × 100          | 100 |
| Trainer checkpoints   | 1 × 50           | 50  |
| MongoDB DLQ           | 3 × 20           | 60  |
| MongoDB audit, Redis  | 3 × 10 each      | 60  |
| MySQL                 | 1 × 20           | 20  |
| Grafana, Loki         | 10 each          | 20  |
| Jaeger, Alertmanager (2 × 1), SPIRE | 5 + 2 + 1 | 8 |

### External dependencies

No price is stated: it depends on the provider, which is not chosen.

| Dependency | Free only if | Where |
| ---------- | ------------ | ----- |
| GitHub Actions (CI, about 10^5 runner-minutes per month per the 2026-11-12 FinOps audit, an estimate) | the repository stays **public**; private repositories bill minutes | `.github/workflows/` |
| GHCR images (`ghcr.io/<owner>`) | the packages stay public | `release.yml` |
| Data sources | each `accessPolicy.terms` is `public-domain` or `attribution` | `services/financial-scraper/src/config/signal-registry.json`, ADR-0036 |
| Off-site backup bucket (S3, Object Lock) | never: paid storage, provider not chosen | [BACKUP_DR.md](BACKUP_DR.md), ADR-0033 |
| Audit anchor bucket (S3, Object Lock) | never: paid storage, provider not chosen | ADR-0027 |

## Infrastructure Components

### MySQL

- StatefulSet (MySQL 8.4) as a single primary with no automatic failover ([ADR-0020](../adr/0020-database-topology-as-deployed.md)); one-member group replication, bootstrapped
  by the `mysql-cluster-init` Job; per-pod `server_id` / local address passed
  as mysqld arguments
- 20Gi PVC (`data-mysql-0`)
- Retention: CronJob `db-retention` purges market data and signals older than `RETENTION_DAYS` as MySQL user `retention` (key `MYSQL_RETENTION_PASSWORD` of `trading-model-secrets`, to seal before the first production deploy; `db-migrate-user` runs again after the migrations to grant it per table). Operation: [BACKUP_DR.md](BACKUP_DR.md#retention-job), ADR-0051
- Schema from the `db-migrate` Job (`run-migrations.sh`), the same migrations as compose: no second copy of the schema. The script waits for `mysql-cluster-init` first (during the bootstrap the server is `super_read_only`). The Job runs the released `db-migrate` image (`deploy/migrate`: `migrate.mjs`, `scripts/migrations`, `mysql2` locked by its `bun.lock`; pinned by digest by `deploy.yml`): nothing is installed at run time. It connects as the MySQL user `migrator` (DDL/DML on `financial_scraper` only, password `MYSQL_MIGRATE_PASSWORD`), created or updated on every deploy by the idempotent Job `db-migrate-user` (the only one that reads `MYSQL_ROOT_PASSWORD`; works on a database initialised before the user existed). The password must match `[A-Za-z0-9_.@%+=-]`
- PodDisruptionBudget: maxUnavailable 1 (one pod: `minAvailable` would block `kubectl drain`)

### MongoDB (Replica Set)

- StatefulSet with 3 replicas (Community edition)
- 20Gi PVC per replica
- Replica set initialized via an idempotent init Job (members: the pods that
  answer, so scaled-down overlays work)
- Headless service for DNS-based discovery
- PodDisruptionBudget: minAvailable 2

### Redis + Sentinel

- Redis primary: StatefulSet, 1 replica, 10Gi PVC
- Redis sentinel: StatefulSet, 3 replicas, anti-affinity
- Sentinel configuration via ConfigMap
- Services for primary and sentinel discovery

### Observability Stack

- **OpenTelemetry Collector:** 2 replicas, accepts OTLP HTTP (traces only, no metrics
  pipeline), exposes its own telemetry on :8888 (`OtelSpanExportFailing`), health on
  :13133
- **Jaeger:** 1 replica, OTLP gRPC receiver
- **Prometheus:** StatefulSet, 50Gi PVC, 30d retention, mTLS scrape
  (`kubelet` / `cadvisor` jobs: the kubelet certificate is verified by the cluster
  CA in production, so the nodes need `serverTLSBootstrap: true` and approved
  `kubelet-serving` CSRs; staging overlays skip the check. See
  [runbook-infrastructure](../operations/runbooks/runbook-infrastructure.md))
- **Grafana:** StatefulSet, 10Gi PVC, Prometheus + Jaeger datasources
- **Loki + promtail:** promtail is a node agent (`trading-model-node`) tailing
  `/var/log/pods` of the application namespace
- **Alertmanager:** credentials read from files (`slack_api_url_file`,
  `routing_key_file`, `url_file`) of the `alertmanager-credentials` Secret,
  written by `deploy.yml` from the GitHub environment (production refuses to
  deploy without a Slack webhook and a dead man's switch). Alertmanager expands
  no environment variables. See [Alerting](../operations/ALERTING.md)

### Workload Identity (SPIRE)

Per [ADR-0011](../adr/0011-spiffe-spire-workload-identity.md) the platform uses SPIFFE/SPIRE instead of the former
in-house CA:

- **SPIRE Server:** Deployment in the application namespace (SQLite datastore
  and CA keys on its PVC `spire-server-data`, ADR-0065; SVID TTL 4 h). Agents
  bootstrap again by themselves when the server CA changes (`rebootstrap_mode`). Config rendered with `-expandEnv` (the official images
  have no shell). The `k8sbundle` notifier publishes the trust bundle into the
  `spire-bundle` ConfigMap of `trading-model-node`
- **SPIRE Agent:** DaemonSet in `trading-model-node` (`hostPID` +
  `hostNetwork`) with the `k8s_psat` node attestor (projected token, audience
  `spire-server`, bootstrapped from `spire-bundle`) + `k8s` workload attestor
- **SPIFFE CSI driver:** DaemonSet in `trading-model-node` exposing the agent
  socket to pods as a `csi.spiffe.io` ephemeral volume. The application
  namespace enforces the `restricted` Pod Security profile, which forbids
  hostPath: the agent and the driver need the host and live in the privileged
  node namespace
- **Registration:** the `spire-entries` sidecar of the server pod
  (`ghcr.io/trading-model/spire-tools`, built from `deploy/spire/` by the
  release) reconciles the agent node alias and one workload entry per service
  account (`spiffe://trading-model.local/ns/<namespace>/sa/<sa>`) at start and
  every 10 minutes
- **Consumption:** `spiffe-helper` sidecars (config file only: ConfigMap
  `spiffe-helper-config`) write `svid.pem`/`svid_key.pem`/`bundle.pem`
  consumed via the standard `TLS_*` paths (`/run/spire/svid`) — part of the base
  kustomization, applied to all workloads (services, prometheus, blackbox-exporter)
- **Metrics:** the `prometheus` identity may only `GET /metrics` on the services

## Security

### Network Policies

All services have NetworkPolicies that restrict ingress/egress:

- Ingress: only from pods of the same namespace (`podSelector: {}`, so overlays
  in other namespaces such as `trading-model-staging` work), except api-gateway
  (ingress controller) and edge-proxy (any namespace, port 8080). edge-proxy may
  only egress to the api-gateway
- Egress: only to required infrastructure ports, plus the shared
  `allow-dns-and-telemetry-egress` policy (cluster DNS, OTLP to the collector)
  for the components with an egress policy. It lists them explicitly: a
  policy selecting a pod for Egress isolates its egress, so selecting every
  pod would cut the others (Redis, Mongo, Grafana...) down to DNS + OTLP
- External egress: only for financial-scraper (Binance API)

### Encryption at Rest

- Node data disks: LUKS2, unlocked at boot by Clevis through Tang servers
  hosted on other machines (or the TPM2 of a home PC): `deploy/host/`
- Backups: every dump encrypted with age while written (`backup-tools` image,
  `BACKUP_REQUIRE_ENCRYPTION=true`, recipients in the `backup-encryption`
  ConfigMap written by `deploy.yml`); only `.age` files go off-site

Details, threat model and operations: [Encryption at Rest](ENCRYPTION_AT_REST.md).

### Secrets Management

- **Development:** Kubernetes Secrets with generator values
- **Production:** Use SealedSecrets, External Secrets Operator, or Vault
- **TLS certificates:** cert-manager ClusterIssuer manages only the **public ingress** certs (api-gateway, Grafana). MySQL client TLS uses a cert-manager Issuer of the namespace (`docs/deployment/MYSQL_TLS.md`). Inter-service mTLS is entirely SPIRE-based (ADR-0011): SVIDs issued by SPIRE Server, consumed via `spiffe-helper` sidecars — no manual TLS secrets for internal traffic.

### Service Accounts

Each service has a dedicated ServiceAccount with `automountServiceAccountToken: false` (no pods need K8s API access).

## Known Limitations (current version)

1. **Encryption at rest lives below the databases** — the community editions
   run without database-level encryption (the former options were
   MariaDB-only and MongoDB Enterprise-only and crashed both databases). Data
   disks are encrypted on the hosts (LUKS2 + Clevis/Tang, `deploy/host/`) and
   backups with age: see [Encryption at Rest](ENCRYPTION_AT_REST.md). Nothing
   in the cluster can tell whether the nodes' disks are encrypted: run
   `deploy/host/check-encryption.sh` on each node
2. **MySQL has no failover** — the group has one member (`mysql-0`),
   bootstrapped on the first member only; joining others is not automated
   (ADR-0020)
3. **Grafana is single-instance** — dashboard provisioning but no HA
4. **Jaeger is single-instance** — Badger storage on the 5Gi PVC `jaeger-data`, traces kept 72 h (not Elasticsearch/Cassandra, ADR-0055)
5. **Off-site backups need a bucket** — the `db-backup` CronJob copies the
   age-encrypted files with rclone once the `trading-model-backup-s3` secret
   exists; without it they stay on the in-cluster `backup-data` volume
6. **Pod Security admission** — the application namespace enforces
   `restricted`; `trading-model-node` is `privileged` (node agents)
