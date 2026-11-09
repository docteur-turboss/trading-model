# Data Retention Policy

> **Effective:** 2026-06 (revised 2026-10 after audit 13.09)  
> **Review:** Annual

## Policy Statement

Data shall be retained only as long as necessary for the purposes for which it is processed, in compliance with applicable financial regulations and data protection law.

## Retention Schedule

| Data Type                                  | System                    | Retention Period                      | Legal Basis                                                            | Deletion Mechanism                                      |
| ------------------------------------------ | ------------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| **Market data** (candles, trades, tickers) | MySQL `financial_scraper` | **5 years** (target)                  | Record-keeping (Delegated Reg. (EU) 2017/565 Art. 72, if operated by an investment firm) | Daily CronJob `db-retention` (`scripts/retention-mysql.sh`, `RETENTION_DAYS`, default 1827; `signals` on `RETENTION_SIGNALS_DAYS`), out of schema since audit A9 (ADR-0051, DPIA action #2) |
| **Audit events**                           | MongoDB `audit_events`    | **5 years**                           | Record-keeping, traceability                                           | TTL index on the `ttl` field (`AUDIT_RETENTION_DAYS`, default 1827) |
| **Messages in transit**                    | message-manager memory    | **Delivery only**                     | Operational necessity — routing                                        | Not persisted                                           |
| **Dead letter entries**                    | MongoDB `dlq_entries`     | **30 days**                           | Operational — messages not delivered after retries                     | TTL index on `createdAt` + prune every minute above `MAX_ENTRIES` |
| **SVIDs**                                  | `/run/spire/svid` (spiffe-helper) | **1h TTL** (auto-rotated)            | Security best practice                                                 | SPIRE Server SVID rotation                              |
| **SPIRE trust bundle**                     | SPIRE datastore (MySQL `spire`) | **168h** (ca_ttl)                    | Security best practice                                                 | SPIRE CA manager                                       |
| **Service tokens**                         | K8s Secrets               | **Until rotated** (weekly)            | Security                                                               | Manual rotation via `scripts/rotate-secrets.sh`         |
| **API access logs** (truncated caller IP)  | edge-proxy → Loki         | **31 days**                           | GDPR Art. 6(1)(f) — security of the service                            | Loki retention `744h`                                   |
| **Operational logs**                       | stdout / Promtail → Loki  | **31 days**                           | Operational debugging                                                  | Loki retention `744h`                                   |
| **Prometheus metrics**                     | Prometheus TSDB           | **30 days**                           | Operational monitoring                                                 | `--storage.tsdb.retention.time=30d`                     |
| **Traces**                                 | Jaeger (Badger on PVC `jaeger-data`) | **72 hours**               | Operational debugging                                                  | `BADGER_SPAN_STORE_TTL=72h` (ADR-0055)              |
| **Backups** (age-encrypted dumps)          | Local backup dir / off-site S3 | **30 days** (daily, every component); off-site only, audit (`mongodb-audit`) and MySQL dump: **12 weeks** (weekly) and **60 months** (monthly) | Disaster recovery; the long tiers cover the 5-year record-keeping of audit events and market data (ADR-0032) | `prune_old` (GFS, `RETENTION_DAYS`, never the newest complete run); off-site: one bucket lifecycle rule per prefix, `daily/` 31 d, `weekly/` 85 d, `monthly/` 1830 d ([BACKUP_DR.md](../deployment/BACKUP_DR.md#off-site-tiers)) |

### Backups and data minimisation

Only the backups of the records kept 5 years go past 30 days (ADR-0032): the audit trail (`mongodb-audit`) and the MySQL dump (`financial_scraper`). The backups of the operational MongoDB (`dlq_entries`, 30 days), of the model checkpoints and of the SPIRE CA private keys (`spire/keys_*`) are never promoted and are gone after 30 days locally, 31 days off-site.

- The MySQL dump is a single file that also holds the `spire` database (registration entries and trust bundle, no private key): its monthly copies keep those for 5 years. Low stakes, accepted by ADR-0032.
- The point-in-time archives (MySQL binlogs, MongoDB oplog slices, ADR-0031) hold every write, DLQ included: they are kept 72 h locally and 3 days off-site, never promoted, and the `.pitr` starting points never go to the weekly or monthly tiers.
- A monthly backup keeps what it contains for up to 60 months after it was taken: an audit event or a candle may thus outlive its 5-year retention in the live database by up to 5 years, in an encrypted backup. The 5 years of MiFID II are a minimum, and the backups hold no personal data (data processing register, activity 7), so this is accepted; a restore of such a backup must not bring back data past its retention.

## Financial Regulatory Justification

### MiFID II (Markets in Financial Instruments Directive)

- **Art. 16(6) MiFID II and Art. 72 of Delegated Regulation (EU) 2017/565 — Record-keeping:** investment firms must retain their records for at least **5 years** (a minimum, not a maximum)
- **Application:** If the trading-model platform is used by an investment firm for algorithmic trading decisions, all market data inputs, training records, and agent decision logs must be retained for 5 years

### MAR (Market Abuse Regulation)

- **Art. 16 — Market surveillance:** Requires detection and reporting of suspicious transactions
- **Application:** Training data and agent behavior logs must be retained to demonstrate compliance with market abuse prevention

### GDPR

- **Art. 5(1)(e) — Storage limitation:** "kept in a form which permits identification of data subjects for no longer than is necessary"
- **Application:** the only personal data is the truncated caller IP in API access logs, kept 31 days. The 5-year retentions above concern data without personal data, so they do not conflict with storage limitation

## Implementation

### MySQL Market Data Retention

A daily Kubernetes CronJob, `db-retention` (ADR-0051), runs `scripts/retention-mysql.sh`: it deletes, in bounded batches, the rows of `market_candles`, `market_trades`, `market_tickers`, `market_order_books` (column `timestamp`) and `signals` (column `observed_at`) older than `RETENTION_DAYS` (1827 days, 5 years; `RETENTION_SIGNALS_DAYS` for signals, same default). It connects as MySQL user `retention`, which can only SELECT and DELETE on those five tables. Migration 003 used to hold a `DELETE` event; per deployment audit A9 destructive `DELETE`s no longer live in schema migrations, so the migration stays empty and the job replaces it. Operation, metrics, alerts (`RetentionFailed`, `RetentionStale`) and the compose equivalent: [BACKUP_DR.md](../deployment/BACKUP_DR.md#retention-job).

### MongoDB Audit Retention

Configure via environment variable:

```bash
AUDIT_RETENTION_DAYS=1827  # 5 years (default in code: 1827)
```

Each event stores its expiry date in the `ttl` field at insert; the TTL index on it (`expireAfterSeconds: 0`) is created at startup by the audit-logger. Changing `AUDIT_RETENTION_DAYS` only applies to new events.

### API Access Logs

The edge-proxy writes its access log with `log_format anonymized` (`deploy/edge-proxy/default.conf`): the caller IP is truncated (IPv4 /24, IPv6 /48) before the line is written; the query string, User-Agent and X-Forwarded-For are not logged. Loki drops the lines after 744h.

### Exceptions

Data may be retained longer if:

- Required by law enforcement or regulatory investigation (legal hold)
- Subject to litigation preservation
- Necessary for the establishment, exercise, or defense of legal claims
