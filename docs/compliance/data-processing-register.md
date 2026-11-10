# Data Processing Register — Art. 30 GDPR

> **Registered as of:** 2026-10 (revised after audit 13.09)  
> **Review cadence:** Quarterly, and on every change to a data store, a retention setting or the external entry point

## Controller (Art. 30(1)(a))

| Field                       | Value                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **Controller**              | _To be filled by the operating entity: legal name, address, registration number. Production prerequisite ([DEPLOY.md](../deployment/DEPLOY.md))_ |
| **Contact**                 | _To be filled: privacy contact address. Production prerequisite ([DEPLOY.md](../deployment/DEPLOY.md))_ |
| **Representative (Art. 27)**| Not applicable when the controller is established in the EU                                 |
| **Data Protection Officer** | Not designated. Art. 37 requires one only for public bodies, or when the core activity is large-scale regular monitoring of individuals or large-scale processing of special categories; neither applies. (The 250-employee threshold of Art. 30(5) concerns the register, not the DPO: this register is kept regardless) |

## Overview

This register documents the processing activities of the trading-model platform, as required by Article 30 GDPR.

**Personal data in scope:** the platform has no user accounts, profiles, cookies or tracking. Its only personal data is the **IP address of external callers** of the API (activity 6): truncated by the edge-proxy before it is logged or forwarded, and kept 31 days in Loki. A truncated address (IPv4 /24, IPv6 /48) is pseudonymized, not anonymous, so the activity is registered. Every other activity processes machine-generated data only (market data, service identities, service events). Inside the platform, the remaining IPs are pod and container addresses; application logs truncate any IP they record (`anonymizeIp`), and log context fields are redacted before persistence.

---

## Processing Activity 1: Market Data Ingestion

| Field                    | Value                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**              | Ingest financial market data (OHLCV candles, trades, order books, tickers) for algorithmic trading agent training and backtesting |
| **Data categories**      | Trading symbols (e.g., BTCUSDT), numeric price/volume data, timestamps, market identifiers                                        |
| **Personal data**        | None                                                                                                                              |
| **Recipients**           | Internal: trader-trainer, audit-logger, message-manager                                                                           |
| **Transfers outside EU** | None. Market data is **received** from the Binance public API (Cayman Islands); nothing is sent to it. See third-party assessment |
| **Retention period**     | 1827 days (5 years, record-keeping, see [Data Retention Policy](data-retention-policy.md)): daily CronJob `db-retention` (`scripts/retention-mysql.sh`, `RETENTION_DAYS`; `signals` on `RETENTION_SIGNALS_DAYS`), ADR-0051 |
| **Technical measures**   | mTLS (SPIFFE SVIDs), LUKS2 data disks, age-encrypted backups, RBAC service accounts                                               |
| **System**               | financial-scraper → MySQL (market_candles, market_trades, market_tickers, market_order_books, signals). `signals` (ADR-0036) holds numeric observations of public sources free for any use: bond yields (ECB), company filings (SEC EDGAR), weather observations (NWS), daily Wikipedia page views (Wikimedia, counts only); see [Third-Party DPAs](third-party-dpas.md#signal-sources-adr-0036) |

## Processing Activity 2: Message Routing

| Field                    | Value                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Purpose**              | Inter-service publish/subscribe with delivery retries; undeliverable messages go to the dead-letter queue |
| **Data categories**      | Message payloads (JSON), metadata (topic, publisher identity, timestamps, correlation IDs), delivery status |
| **Personal data**        | None                                                                                                      |
| **Recipients**           | Internal platform services only                                                                           |
| **Transfers outside EU** | None — all services are self-hosted                                                                       |
| **Retention period**     | message-manager: payloads journaled 24 h in Redis Streams (`JOURNAL_RETENTION_MS` = 24 h, `XADD … MINID` trim; AOF + replication; ACL user `message-manager`, ADR-0048), no personal data by design. DLQ: 30 days (TTL index on `createdAt`), capped at `MAX_ENTRIES` (100 000) |
| **Technical measures**   | mTLS between services (not toward databases, ADR-0060), payload sanitization, deduplication                                                      |
| **System**               | message-manager (HTTP push) → dlq-service → MongoDB (`dlq_entries`)                                       |

## Processing Activity 3: Audit Logging

| Field                    | Value                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Purpose**              | Hash-chained audit trail of service events, decisions and errors, for traceability                               |
| **Data categories**      | Service event metadata (publisher identity, message ID, topic, correlation ID, timestamp), payload snapshots     |
| **Personal data**        | None                                                                                                             |
| **Recipients**           | Internal: operators (read-only, via api-gateway), compliance (MongoDB queries)                                   |
| **Transfers outside EU** | None                                                                                                             |
| **Retention period**     | 1827 days (5 years): `AUDIT_RETENTION_DAYS`, TTL index on the `ttl` field set at insert                          |
| **Technical measures**   | Append-only hash chain, gap detection, LUKS2 data disks, age-encrypted backups                                   |
| **System**               | audit-logger → MongoDB (`audit_events`)                                                                          |

## Processing Activity 4: Workload Identity (SPIRE SVIDs)

| Field                    | Value                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**              | SPIFFE/SPIRE workload identity (SVID issuance/rotation) for mTLS between all platform services                                 |
| **Data categories**      | Service identities (service names, namespaces, service accounts), short-lived X.509 SVIDs, trust bundle                       |
| **Personal data**        | None — service identities only                                                                                                 |
| **Recipients**           | All platform services (SVID distribution via `spiffe-helper` sidecars)                                                        |
| **Transfers outside EU** | None                                                                                                                           |
| **Retention period**     | SVIDs: 4h TTL (auto-rotated, ADR-0062). Trust bundle: 168h (ca_ttl). SPIRE datastore entries: workload lifecycle                         |
| **Technical measures**   | Workload attestation (docker / k8s_psat), short-lived SVIDs, automatic rotation                                               |
| **System**               | SPIRE Server → SPIRE Agent → spiffe-helper (datastore: SQLite on its volume)                                                         |

## Processing Activity 5: ML Training Data

| Field                    | Value                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Purpose**              | Training of genetic algorithm + deep Q-learning trading agents on historical market data                           |
| **Data categories**      | Market data features (normalized arrays), agent genome parameters, fitness scores, training checkpoints            |
| **Personal data**        | None                                                                                                               |
| **Recipients**           | Internal: trader-trainer, checkpoint files on shared volume                                                        |
| **Transfers outside EU** | None                                                                                                               |
| **Retention period**     | Best agent checkpoint: retained. Intermediate: discarded by auto-pruning                                           |
| **Technical measures**   | Shared volume with restricted RBAC                                                                                 |
| **System**               | trader-trainer → memory + shared volume (trainer-checkpoints-pvc)                                                  |

## Processing Activity 6: API Access Logs (edge-proxy)

| Field                    | Value                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Purpose**              | Security monitoring and troubleshooting of external calls to the API                                               |
| **Data categories**      | Truncated caller IP (IPv4 /24, IPv6 /48), timestamp, method, path without query string, status, size, duration, correlation ID (caller-supplied `X-Correlation-Id` if valid, else generated by nginx). No User-Agent, no X-Forwarded-For, no credentials |
| **Data subjects**        | Operators and tools calling the public API                                                                         |
| **Legal basis**          | Legitimate interest (Art. 6(1)(f)) — security of the service (recital 49)                                          |
| **Recipients**           | Internal: operators (Grafana/Loki)                                                                                 |
| **Transfers outside EU** | None — Loki is self-hosted                                                                                         |
| **Retention period**     | 31 days (Loki `retention_period: 744h`)                                                                            |
| **Technical measures**   | Ingress controller in front (K8s): access log disabled (`disable-access-log`, prerequisite in `docs/deployment/KUBERNETES.md`), so no full IP, User-Agent or Referer is written on the node; node-level `error_log` rotated at 7 days or less. The edge-proxy takes the caller IP from `X-Forwarded-For` only when the connection comes from a pod CIDR (`deploy/edge-proxy/realip.k8s.inc`). Truncation in nginx before the log line is written (`log_format anonymized`, `deploy/edge-proxy/default.conf`); the gateway forwards only an anonymized `X-Forwarded-For` and drops `X-Real-IP` |
| **Ingress controller (K8s)** | Access log disabled: no log line, so no retention. Format: none. Its `error_log` has no request line but may show the peer IP; node log rotation of 7 days or less is a production prerequisite (`docs/deployment/KUBERNETES.md`) |
| **System**               | edge-proxy (stdout) → Promtail → Loki                                                                              |

## Processing Activity 7: Operational Telemetry and Backups

| Field                    | Value                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Purpose**              | Monitoring, tracing, alerting; disaster recovery                                                                   |
| **Data categories**      | Service logs, metrics, traces (pod addresses, service names); database dumps of activities 1–4                     |
| **Personal data**        | None (application logs truncate IPs and redact sensitive keys). Backups contain no personal data since activities 1–4 hold none |
| **Recipients**           | Internal: operators. Alerts: Slack or Discord, Pushover, dead man's switch (alert names, labels, descriptions and runbook links only). Backups: off-site S3 store, age-encrypted before upload. Audit anchors: S3 Object Lock bucket (hashes only). Sheets: `third-party-dpas.md` |
| **Transfers outside EU** | Depends on the region of the off-site S3 store, of the audit-anchor bucket and on the alert providers (Slack or Discord, Pushover, dead man's switch) — to be recorded by the operating entity in the sheets of `third-party-dpas.md`. Requirement: backup bucket in an EU region (`BACKUP_S3_ALLOWED_REGIONS`, checked by `deploy.yml`); the audit-anchor bucket must follow it (not checked) |
| **Retention period**     | Loki: 31 days. Prometheus: 30 days. Jaeger: 72 hours (Badger on the PVC `jaeger-data`, `BADGER_SPAN_STORE_TTL`, ADR-0055). Backups (ADR-0032): 30 days locally (`RETENTION_DAYS`, dailies only); off-site daily 31 days, plus for the audit trail and the MySQL dump weekly 12 weeks and monthly 60 months (bucket lifecycle rules per prefix) |
| **Technical measures**   | LUKS2 data disks, age encryption of every dump before it is written, only `.age` files copied off-site             |
| **System**               | Promtail → Loki, Prometheus, Jaeger, Alertmanager; `db-backup` CronJob / `scripts/backup*.sh`                      |

---

## Summary

| Activity                 | Personal Data?      | Legal Basis         | Retention                    | Transfers                    |
| ------------------------ | ------------------- | ------------------- | ---------------------------- | ---------------------------- |
| Market Data Ingestion    | ❌ None             | —                   | 1827 days (`db-retention`) | Received from Binance        |
| Message Routing          | ❌ None             | —                   | Redis journal 24 h; DLQ 30 days       | None                         |
| Audit Logging            | ❌ None             | —                   | 5 years (1827 days)          | None                         |
| Workload Identity        | ❌ None             | —                   | 4h–168h                      | None                         |
| ML Training              | ❌ None             | —                   | Per-agent                    | None                         |
| API Access Logs          | ✅ Truncated IP     | Legitimate interest | 31 days                      | None                         |
| Telemetry and Backups    | ❌ None             | —                   | 30–31 days                   | Off-site store / Slack (TBD) |

**Conclusion:** one activity processes personal data, limited to a truncated IP kept 31 days for security. Data subject rights apply to it in principle; since a truncated address cannot be linked to a requester, Art. 11 applies (no additional data collected to identify them).
