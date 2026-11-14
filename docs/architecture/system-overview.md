# System Overview (C4)

Four views of the system, each node checkable in `docker-compose.yml`, `deploy/k8s/` or the code. Related: [ADR-0011](../adr/0011-spiffe-spire-workload-identity.md) (SPIRE), [ADR-0048](../adr/0048-durable-message-journal-in-redis-streams.md) (broker), [ADR-0023](../adr/0023-discovery-registry-in-redis.md) (registry), [Databases](databases.md), [Bounded Contexts](bounded-contexts.md).

> **Offline consumer only.** Trained models (`training.model.published`, weights route open to `model-evaluator` alone through `MODEL_DOWNLOAD_CALLERS`) are verified and recorded by the offline `model-evaluator`; collected signals (`GET /financial-scraper/signals/assets/:assetId`) are read by no service. There is no paper-trading or execution context. See [ADR-0049](../adr/0049-downstream-context-for-models-and-signals.md) (Accepted).

## 1. C4 level 1 — Context

```mermaid
flowchart LR
  client["API client<br/>(API key, no frontend: ADR-0018)"]
  binance["Binance<br/>(market data REST)"]
  s3["S3 buckets, Object Lock<br/>(backups, audit anchors)"]
  ops["Operator<br/>(Grafana, Alertmanager receivers)"]
  system["trading-model<br/>8 services + data stores + SPIRE + observability"]
  client -->|HTTPS /v1| system
  system -->|scrape candles| binance
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
    tt["trader-trainer<br/>(npm name trader-service)"]
    al["audit-logger"]
    dlq["dlq-service"]
  end

  gw -->|"PUBLIC_ROUTES only"| al
  gw --> dlq
  gw --> fs
  gw --> disc
  gw --> tt
  fs -->|"publish candles"| mm
  mm -->|"callback /message"| tt
  mm -->|"callback /message (audit, training, dlq topics)"| al
  mm -->|"signed POST /dlq"| dlq
  services -.->|"register + heartbeat (address-manager)"| disc

  binance["Binance"] --> fs
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

message-manager keeps its subscriptions and a durable message journal (Redis Streams) in Redis (ADR-0048): it has no database of its own. MongoDB belongs to audit-logger and dlq-service. Compose runs one `mongo` container (databases `audit-logger` and `dlq`); K8s runs two StatefulSets, `mongo-audit` and `mongo-dlq`.

## 3. Kubernetes deployment

```mermaid
flowchart TB
  subgraph tm["namespace trading-model (Pod Security: restricted)"]
    ing["Ingress gateway / grafana"] --> edge["Deployment edge-proxy"]
    edge --> svc["Deployments: api-gateway, discovery-server,<br/>message-manager, financial-scraper,<br/>audit-logger, dlq-service<br/>(HPA, PDB, topologySpreadConstraints);<br/>trader-trainer: 1 replica, training on the Lease holder only (ADR-0058);<br/>financial-scraper-collector: 1 replica, crons on the Lease holder only (ADR-0057)"]
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
  participant AL as audit-logger
  participant DLQ as dlq-service
  Note over FS: only the collector pod holding the Lease financial-scraper-collector runs the cycles (ADR-0057)
  loop each scrape cycle, per symbol
    FS->>B: fetch candles
    FS->>DB: persist candles
    FS->>DB: read market_publish_cursors, next persisted candles
    FS->>MM: POST /message (requireSubscriber)
    alt a subscriber is reachable
      MM->>TT: callback /message
      MM->>AL: callback /message
      MM-->>FS: all deliveries settled
      FS->>DB: advance cursor
    else no subscriber (503) or message-manager down
      MM-->>FS: refused
      Note over FS,DB: cursor stays: next cycle resends from MySQL<br/>alert MarketDataUnpublished after 15 min
    end
  end
  opt a subscriber keeps failing (at-least-once, 10 attempts)
    MM->>DLQ: signed POST /dlq
    Note over MM,DLQ: dlq-service down: entry stays in the journal, retried
  end
```

Each subscribed service gets one delivery per message, whatever its number of instances: message-manager groups the subscribed instances by service and posts to the service name, the Kubernetes Service picks the pod (consumer group, [ADR-0043](../adr/0043-message-delivery-once-per-subscribed-service.md)).

Recoveries: persist-before-publish and the cursor make a bus outage lossless for candles; dead letters can be replayed through `POST /dlq/replay`; an `exactly-once` message relies on audit-logger being idempotent on `messageId`. See [runbook-message-bus-outage](../operations/runbooks/runbook-message-bus-outage.md).
