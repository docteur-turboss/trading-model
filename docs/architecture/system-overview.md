# System Overview (C4)

Four views of the system, each node checkable in `docker-compose.yml`, `deploy/k8s/` or the code. Related: [ADR-0011](../adr/0011-spiffe-spire-workload-identity.md) (SPIRE), [ADR-0073](../adr/0073-message-bus-as-a-redis-streams-library.md) (bus), [ADR-0023](../adr/0023-discovery-registry-in-redis.md) (registry, being retired by [ADR-0072](../adr/0072-dns-routing-and-majors-served-by-services.md)), [Databases](databases.md), [Bounded Contexts](bounded-contexts.md).

> **Paper only.** Trained models (`training.model.published`, weights route open to `model-evaluator` alone through `MODEL_DOWNLOAD_CALLERS`) are verified and replayed on stored candles by the offline `model-evaluator` ([ADR-0079](../adr/0079-replay-window-in-the-model-manifest.md)). Collected signals (`GET /financial-scraper/signals/assets/:assetId`) enter the network only when `FEATURE_SIGNAL_INPUTS` is on (default off, [ADR-0081](../adr/0081-signal-inputs-to-the-network.md), mask [ADR-0082](../adr/0082-input-mask-gene.md)). `risk-execution` owns every order, paper only (simulated broker, kill switch, [ADR-0064](../adr/0064-risk-and-execution-context-before-order-flow.md)): it takes intents over HTTP (`POST /intents`), only from `decision-consumer` ([ADR-0087](../adr/0087-paper-decision-consumer.md): promoted models, decision on each closed bar), and reads its prices from financial-scraper. See [ADR-0049](../adr/0049-downstream-context-for-models-and-signals.md).

## 1. C4 level 1 — Context

```mermaid
flowchart LR
  client["API client<br/>(API key, no frontend: ADR-0018)"]
  binance["Binance<br/>(market data REST)"]
  sig["Public signal sources<br/>(signal-registry.json: ADR-0036/0075/0080)"]
  s3["S3 buckets, Object Lock<br/>(backups, audit anchors)"]
  ops["Operator<br/>(Grafana, Alertmanager receivers)"]
  system["trading-model<br/>services + data stores + SPIRE + observability"]
  client -->|HTTPS /v1| system
  system -->|scrape candles| binance
  system -->|"collect signals"| sig
  system -->|age-encrypted backups, audit anchors| s3
  system -->|alerts, dashboards| ops
```

## 2. C4 level 2 — Containers

```mermaid
flowchart TB
  client["API client"] -->|"HTTPS :8449 (compose)"| edge["edge-proxy<br/>nginx"]
  edge -->|"/v1, own SVID"| gw["api-gateway"]

  subgraph services["Services (HTTPS :3000, SPIFFE mTLS)"]
    gw
    disc["discovery-server"]
    mm["message-manager"]
    fs["financial-scraper"]
    tt["trader-trainer<br/>(npm name trader-trainer)"]
    al["audit-logger"]
    dlq["dlq-service"]
    me["model-evaluator"]
    re["risk-execution<br/>(paper broker, kill switch)"]
    dc["decision-consumer<br/>(ADR-0087)"]
  end

  gw -->|"PUBLIC_ROUTES only"| al
  gw --> dlq
  gw --> fs
  gw --> disc
  gw --> tt
  tt -->|"GET /candles (ADR-0078)"| fs
  tt -->|"training.model.published"| mm
  mm -->|"callback /message (audit, training, dlq, risk topics)"| al
  mm -->|"training.model.published"| me
  me -->|"weights"| tt
  me -->|"candles for replay"| fs
  re -->|"model admission"| tt
  dc -->|"manifest of promoted models"| tt
  dc -->|"candles"| fs
  dc -->|"POST /intents"| re
  re -->|"risk.* events"| mm
  re --> rpvc[("risk-execution volume<br/>state, paper ledger")]
  mm -->|"dead letter to Redis dead stream"| redis
  services -.->|"register + heartbeat (address-manager)"| disc

  binance["Binance"] --> fs
  sig["Public signal sources<br/>(signal-registry.json)"] --> fs
  fs --> mysql[("MySQL<br/>market data")]
  al --> mongoA[("MongoDB audit<br/>mongo-audit in K8s")]
  dlq --> mongoD[("MongoDB dlq<br/>mongo-dlq in K8s")]
  dlq --> redis[("Redis HA<br/>sentinels in K8s")]
  disc --> redis
  mm -->|"subscriptions"| redis
  tt --> ckpt[("checkpoints volume")]

  subgraph spire["SPIRE (ADR-0011)"]
    ss["spire-server"] --> spiredb[("SQLite datastore<br/>own volume (ADR-0065)")]
    sa["spire-agent"] --> ss
    sh["spiffe-helper sidecars (compose)<br/>CSI driver (K8s)"] --> sa
  end

  subgraph obs["Observability"]
    prom["Prometheus"] --> am["Alertmanager"]
    graf["Grafana"] --> prom
    loki["Loki"]
    jaeger["Jaeger + otel-collector (K8s)"]
  end
  prom -.->|"scrape /metrics"| services
```

The bus journal is Redis Streams in the shared Redis. [ADR-0073](../adr/0073-message-bus-as-a-redis-streams-library.md) release N: services that set their `REDIS_*` variables publish and consume in process through the library, the others still go through message-manager, which shares the same streams and groups; message-manager has no database of its own. MongoDB belongs to audit-logger and dlq-service. Compose runs one `mongo` container (databases `audit-logger` and `dlq`); K8s runs two StatefulSets, `mongo-audit` and `mongo-dlq`.

## 3. Kubernetes deployment

```mermaid
flowchart TB
  subgraph tm["namespace trading-model (Pod Security: restricted)"]
    ing["Ingress gateway / grafana"] --> edge["Deployment edge-proxy"]
    edge --> svc["Deployments: api-gateway, discovery-server,<br/>message-manager, financial-scraper,<br/>audit-logger, dlq-service<br/>(HPA, PDB, topologySpreadConstraints);<br/>model-evaluator, risk-execution: 1 replica, own PVC;<br/>trader-trainer: 1 replica, training on the Lease holder only (ADR-0058);<br/>financial-scraper-collector: 1 replica, crons on the Lease holder only (ADR-0057)"]
    svc --> mysql["StatefulSet mysql"]
    svc --> mA["StatefulSet mongo-audit"]
    svc --> mD["StatefulSet mongo-dlq"]
    svc --> rd["StatefulSet redis (master + 2 replicas)"]
    svc --> rs["StatefulSet redis-sentinel (3)"]
    ss["Deployment spire-server"] --> sspvc["PVC spire-server-data (SQLite)"]
    obs["StatefulSets prometheus, alertmanager, grafana, loki<br/>Deployments jaeger, otel-collector, blackbox-exporter"]
    jobs["CronJobs db-backup, db-backup-incremental; Job migrate"]
  end
  subgraph node["namespace trading-model-node (privileged)"]
    agent["DaemonSet spire-agent"]
    csi["DaemonSet spiffe-csi-driver"]
    pt["DaemonSet promtail"]
  end
  csi -->|"csi.spiffe.io volume (agent socket)"| svc
  agent --> ss
  csi --- agent
  pt --> loki["Loki"]
```

The restricted namespace forbids `hostPath`, so every host-level agent lives in `trading-model-node` (see `deploy/k8s/node-agents`).

## 4. Market data flow

```mermaid
sequenceDiagram
  participant B as Binance
  participant FS as financial-scraper
  participant DB as MySQL
  participant MM as message-manager
  participant TT as trader-trainer
  participant R as Redis
  Note over FS: only the collector pod holding the Lease financial-scraper-collector runs the cycles (ADR-0057)
  loop each scrape cycle, per symbol
    FS->>B: fetch candles
    FS->>DB: persist candles
  end
  opt each training session of the trainer
    TT->>FS: GET /candles/symbols/:symbol (from, to = session start, keyset pages)
    FS->>DB: read the stored candles
    Note over TT: the candle window comes from MySQL, not from the bus (ADR-0044)
  end
  opt a subscriber keeps failing (at-least-once, 10 attempts)
    MM->>R: dead letter to dead stream
    Note over MM,R: after 10 attempts the entry is copied to the dead stream, then acked in the journal
  end
```

The trainer subscribes to no topic: its candle window is read from financial-scraper at each session ([ADR-0078](../adr/0078-trainer-features-from-candles-only.md)).

Each subscribed service gets one delivery per message, whatever its number of instances: one consumer group per subscriber service, every replica a consumer of it ([ADR-0073](../adr/0073-message-bus-as-a-redis-streams-library.md)).

Recoveries: dead letters can be replayed or deleted with the operator CLI `audit-dlq` (audit-logger `dlq-cli.js`); an `exactly-once` message relies on audit-logger being idempotent on `messageId`. See [runbook-message-bus-outage](../operations/runbooks/runbook-message-bus-outage.md).
