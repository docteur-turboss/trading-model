# Data Retention Policy

> **Effective:** 2026-06  
> **Review:** Annual

## Policy Statement

Data shall be retained only as long as necessary for the purposes for which it is processed, in compliance with applicable financial regulations and data protection law.

## Retention Schedule

| Data Type                                  | System                    | Retention Period                      | Legal Basis                                                            | Deletion Mechanism                                      |
| ------------------------------------------ | ------------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| **Market data** (candles, trades, tickers) | MySQL `financial_scraper` | **5 years**                           | MiFID II Art. 72 (record-keeping of transactions)                      | MySQL event `purge_old_market_data` (migration 003, daily, cutoff 1827 days) |
| **Audit events**                           | MongoDB `audit_events`    | **5 years**                           | MiFID II (record-keeping), GDPR Art. 30 (processing register evidence) | TTL index on `recordedAt` field                         |
| **Service messages** (transit)             | Redis Streams             | **2 hours**                           | Operational necessity only — transient routing                         | Stream MAXLEN ~500000 entries                           |
| **Message archive**                        | MongoDB `message_archive` | **90 days**                           | Operational debugging                                                  | TTL index (disabled by default; enable via config)      |
| **Dead letter entries**                    | MongoDB `dlq_entries`     | **30 days**                           | Operational — messages not delivered after retries                     | Prune cron (daily) + `ENTRY_TTL_MS`                     |
| **SVIDs**                                  | `/run/spire/svid` (spiffe-helper) | **1h TTL** (auto-rotated)            | Security best practice                                                 | SPIRE Server SVID rotation                              |
| **SPIRE trust bundle**                     | SPIRE datastore (MySQL `spire`) | **168h** (ca_ttl)                    | Security best practice                                                 | SPIRE CA manager                                       |
| **Service tokens**                         | K8s Secrets               | **Until rotated** (weekly)            | Security                                                               | Manual rotation via `scripts/rotate-secrets.sh`         |
| **Operational logs**                       | stdout / Promtail → Loki  | **30 days**                           | Operational debugging                                                  | Loki retention: `744h` (configurable)                   |
| **Prometheus metrics**                     | Prometheus TSDB           | **15 days**                           | Operational monitoring                                                 | `--storage.tsdb.retention.time=15d`                     |

## Financial Regulatory Justification

### MiFID II (Markets in Financial Instruments Directive)

- **Art. 72 — Record-keeping of transactions:** Investment firms must retain records of all transactions in financial instruments for at least **5 years**
- **Application:** If the trading-model platform is used by an investment firm for algorithmic trading decisions, all market data inputs, training records, and agent decision logs must be retained for 5 years

### MAR (Market Abuse Regulation)

- **Art. 16 — Market surveillance:** Requires detection and reporting of suspicious transactions
- **Application:** Training data and agent behavior logs must be retained to demonstrate compliance with market abuse prevention

### GDPR

- **Art. 5(1)(e) — Storage limitation:** "kept in a form which permits identification of data subjects for no longer than is necessary"
- **Application:** Since no personal data is processed, this principle is satisfied by default. The 5-year financial retention takes precedence over GDPR minimization

## Implementation

### MySQL Market Data Retention

```sql
-- Enable event scheduler
SET GLOBAL event_scheduler = ON;

-- Daily purge of data older than 1827 days (5 years) — see migration 003
CREATE EVENT IF NOT EXISTS purge_old_market_data
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
  DELETE FROM market_candles WHERE close_timestamp < DATE_SUB(NOW(), INTERVAL 1827 DAY);
  DELETE FROM market_trades WHERE timestamp < DATE_SUB(NOW(), INTERVAL 1827 DAY);
  DELETE FROM market_tickers WHERE close_time < DATE_SUB(NOW(), INTERVAL 1827 DAY);
```

See `scripts/migrations/` for the migration to create this event.

### MongoDB Audit Retention

Configure via environment variable:

```bash
AUDIT_RETENTION_DAYS=1827  # 5 years (default: 90)
```

The TTL index on `recordedAt` is created automatically at startup by the audit-logger.

### Exceptions

Data may be retained longer if:

- Required by law enforcement or regulatory investigation (legal hold)
- Subject to litigation preservation
- Necessary for the establishment, exercise, or defense of legal claims
