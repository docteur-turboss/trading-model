# Data Retention Policy

> **Effective:** 2026-06 (revised 2026-10 after audit 13.09)  
> **Review:** Annual

## Policy Statement

Data shall be retained only as long as necessary for the purposes for which it is processed, in compliance with applicable financial regulations and data protection law.

## Retention Schedule

| Data Type                                  | System                    | Retention Period                      | Legal Basis                                                            | Deletion Mechanism                                      |
| ------------------------------------------ | ------------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| **Market data** (candles, trades, tickers) | MySQL `financial_scraper` | **5 years** (target)                  | Record-keeping (Delegated Reg. (EU) 2017/565 Art. 72, if operated by an investment firm) | **None yet** — purge event removed from migration 003 (audit A9); out-of-schema retention job open (DPIA action #2) |
| **Audit events**                           | MongoDB `audit_events`    | **5 years**                           | Record-keeping, traceability                                           | TTL index on the `ttl` field (`AUDIT_RETENTION_DAYS`, default 1827) |
| **Messages in transit**                    | message-manager memory    | **Delivery only**                     | Operational necessity — routing                                        | Not persisted                                           |
| **Dead letter entries**                    | MongoDB `dlq_entries`     | **30 days**                           | Operational — messages not delivered after retries                     | TTL index on `createdAt` + prune every minute above `MAX_ENTRIES` |
| **SVIDs**                                  | `/run/spire/svid` (spiffe-helper) | **1h TTL** (auto-rotated)            | Security best practice                                                 | SPIRE Server SVID rotation                              |
| **SPIRE trust bundle**                     | SPIRE datastore (MySQL `spire`) | **168h** (ca_ttl)                    | Security best practice                                                 | SPIRE CA manager                                       |
| **Service tokens**                         | K8s Secrets               | **Until rotated** (weekly)            | Security                                                               | Manual rotation via `scripts/rotate-secrets.sh`         |
| **API access logs** (truncated caller IP)  | edge-proxy → Loki         | **31 days**                           | GDPR Art. 6(1)(f) — security of the service                            | Loki retention `744h`                                   |
| **Operational logs**                       | stdout / Promtail → Loki  | **31 days**                           | Operational debugging                                                  | Loki retention `744h`                                   |
| **Prometheus metrics**                     | Prometheus TSDB           | **30 days**                           | Operational monitoring                                                 | `--storage.tsdb.retention.time=30d`                     |
| **Traces**                                 | Jaeger (in memory)        | **Until restart**                     | Operational debugging                                                  | In-memory storage                                       |
| **Backups** (age-encrypted dumps)          | Local backup dir / off-site S3 | **30 days**                      | Disaster recovery                                                      | `prune_old` (`RETENTION_DAYS`); off-site: bucket lifecycle rule, set to the same value |

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

Not implemented. Migration 003 used to create a daily MySQL `EVENT` deleting rows older than 1827 days; per deployment audit A9, destructive `DELETE`s no longer live in schema migrations, so the migration is now empty. Until a dedicated retention job exists (DPIA action #2), market data accumulates without bound.

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
