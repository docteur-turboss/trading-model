# Third-Party Data Processing Agreements

## Binance API

**Status:** Assessment completed — DPA not required

### Nature of Data Exchange

The financial-scraper service fetches **market data only** from Binance's public REST API:

| Endpoint                        | Data Retrieved                                 |
| ------------------------------- | ---------------------------------------------- |
| `GET /api/v3/klines`            | OHLCV candles (open, high, low, close, volume) |
| `GET /api/v3/trades`            | Recent trades (price, quantity, side)          |
| `GET /api/v3/depth`             | Order book snapshots (bids, asks)              |
| `GET /api/v3/ticker/24hr`       | 24-hour statistics                             |
| `GET /api/v3/ticker/price`      | Current price ticker                           |
| `GET /api/v3/ticker/bookTicker` | Best bid/ask                                   |

The six endpoints above are the only ones called, all public. No request is signed and no Binance account exists: `BINANCE_API_KEY` / `BINANCE_API_SECRET` are read by no code.

### Regulatory Status (MiCA)

Binance holds no MiCA authorisation. Since 1 July 2026 it no longer accepts sign-ups, deposits or new spot orders from EEA residents and plans to apply in France (AMF). This concerns account holders; the platform has none. On 2026-10-30 every endpoint above answered from France without a key, on `api.binance.com` and `data-api.binance.vision`. Consuming public market data is not receiving a crypto-asset service under MiCA.

The residual risk is a geo-block of the public API (HTTP 451). It is alerted (`BinanceRestrictedLocation`), and the fallbacks and re-examination triggers are set in [ADR-0026](../adr/0026-binance-public-market-data-kept.md).

### Terms of Use of the Data (checked 2026-11-04)

The *Binance Vision Dataset Terms* (version 1.0, last updated 2026-08-26, [data.binance.vision](https://data.binance.vision/Binance_Vision-Terms_of_Use.pdf)) cover the data "made available through data.binance.vision and associated endpoints", which likely includes `data-api.binance.vision`, the ADR-0026 fallback host. They license that data under CC BY-NC-SA 4.0 only: "Commercial licensing is strictly excluded", and §4.2 forbids its use for "live proprietary trading execution" or "automated commercial order generation". Switching `BINANCE_BASE_URL` to that host for live trading would therefore breach them. The terms of `api.binance.com` (Binance Terms of Use) could not be read in full; whether they allow trading on its public market data is not established. Both points need a decision before production use (ADR-0026 re-examination). The signal registry (ADR-0036) holds no Binance source for this reason.

### Data Classification

| Category                        | Contains PII? | Justification                   |
| ------------------------------- | ------------- | ------------------------------- |
| Trading symbols (e.g., BTCUSDT) | No            | Cryptocurrency pair identifiers |
| OHLCV price data                | No            | Numeric market data             |
| Trade volumes                   | No            | Aggregated exchange data        |
| Order book depth                | No            | Public market data              |
| Timestamps                      | No            | Unix timestamps in milliseconds |

### Legal Assessment

1. **GDPR Art. 4(1)** — Personal data definition: "any information relating to an identified or identifiable natural person." Trading symbols and market prices do not identify any natural person.

2. **GDPR Art. 28** — Processor obligations: Binance provides market data as a **data source**, not as a processor on behalf of the trading-model platform. The financial-scraper initiates requests to a public API; Binance has no access to the platform's infrastructure, databases, or internal data.

3. **GDPR Art. 44-49** — International transfers: Data originates from Binance's servers (jurisdiction: Cayman Islands). However, since no personal data is involved, the transfer restrictions of Chapter V GDPR do not apply.

4. **MiFID II / MAR** — Financial regulation: Trading data ingested for algorithmic trading research falls under the platform's record-keeping obligations (5-7 years), not under Binance's responsibilities.

### Conclusion

A formal Data Processing Agreement with Binance is **not required** because:

- The data exchanged is purely market data with no personal identifiers
- Binance operates as a public data source, not as a processor on behalf of the platform
- No personal data is transferred, stored, or processed as a result of the integration

### Documentation Reference

- Binance API Terms of Service: https://www.binance.com/en/terms
- Binance Privacy Policy: https://www.binance.com/en/privacy
- Integration code: `services/financial-scraper/src/adapters/outbound/binance/`

## Signal Sources (ADR-0036)

The financial-scraper collector also reads the public sources of its signal
registry (`services/financial-scraper/src/config/signal-registry.json`). Each
request is an unsigned HTTPS GET without key; only the request itself and its
User-Agent are sent: `automated news analysis <SIGNAL_CONTACT_EMAIL>`. That
e-mail, a dedicated project address of the operator, reaches every source
(SEC EDGAR in the United States included); it is kept out of the public
repository (`.env`, GitHub environment secret).

Every source must be free for any use, trading included: the registry only
accepts `public-domain` or `attribution` terms (`accessPolicy`). Terms checked
on 2026-11-04:

| Source | Data received | PII received? | Terms |
| ------ | ------------- | ------------- | ----- |
| ECB Data Portal (`data-api.ecb.europa.eu`) | Euro area AAA government bond yield, 10-year | No | [Free reuse](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html), commercial included, "Source: ECB statistics", data not modified |
| SEC EDGAR (`data.sec.gov`, United States) | XBRL facts of company filings (Apple EPS) | No | [May be copied or redistributed without permission](https://www.sec.gov/privacy), cite the SEC; fair access: User-Agent with a contact e-mail, at most 10 requests/s |
| US National Weather Service (`api.weather.gov`) | Latest observation of a weather station (Hutchinson, Kansas) | No | [Public domain](https://www.weather.gov/disclaimer), no endorsement implied; User-Agent required |
| Wikimedia Analytics API (`wikimedia.org`) | Daily views of Wikipedia articles | No: counts only | [CC0 1.0](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html); User-Agent with a contact required |

Rejected for their terms: Open-Meteo's free API (non-commercial only) and
Binance's `data-api.binance.vision` (CC BY-NC-SA 4.0, no live trading); no
licence was found for Mastodon API data.

A formal DPA is not required for the same reasons as Binance: public data
sources, not processors, and no personal data received.

## Other Third Parties

| Third Party        | Role                | PII? | DPA Required?                      |
| ------------------ | ------------------- | ---- | ---------------------------------- |
| Binance API        | Market data source  | No   | No — documented above              |
| ECB, SEC EDGAR, NWS, Wikimedia | Signal sources (ADR-0036) | No | No — documented above |
| GitHub Actions     | CI/CD pipeline      | No   | No — no data processed             |
| Docker Hub / GHCR  | Container registry  | No   | No — infrastructure only           |
| Slack or Discord   | Alert notifications | No (alert text) | to be confirmed by the operator — sheet below |
| Pushover           | Critical alert paging | No (alert text) | to be confirmed by the operator — sheet below |
| Dead man's switch  | Heartbeat of Watchdog | No | to be confirmed by the operator — sheet below |
| Off-site S3 store  | Encrypted backups   | No (age-encrypted) | to be confirmed by the operator — sheet below |
| Audit-anchor S3 bucket | Audit chain anchors | No (hashes) | to be confirmed by the operator — sheet below |
| Prometheus/Grafana | Internal monitoring | No   | No — self-hosted, no external data |

Monitoring, tracing and logging infrastructure (Prometheus, Grafana, Jaeger, Loki) is self-hosted. The alert receivers, the dead man's switch and the S3 stores below are external services chosen and contracted by the operating entity; the repository holds no contract or DPA with any of them.

## Operator-chosen Services

The repository neither signs a DPA nor picks a provider. The operating entity signs and records provider, region and contract. "to be confirmed by the operator" marks an answer that depends on the provider chosen and is not invented here.

### Slack or Discord (alert webhook)

| Field | Value |
| ----- | ----- |
| Role | Receives alert notifications (`slack_configs` of `observability/alertmanager.yml`; the webhook may be a Discord `/slack` endpoint). Channels `#alerts`, `#alerts-warning` |
| Data sent | Alert name, severity, job (service) name, summary, description, runbook URL. No personal data by design (labels carry pod and service names; application logs are not sent) |
| Region | Slack: data region chosen by the workspace owner; Discord: to be confirmed by the operator |
| Processor? | Only if a message ever contains personal data (an operator's name in a description); the operators' own accounts are the provider's own processing |
| Mechanism | Slack: customer DPA, SCCs and EU-US Data Privacy Framework per its public terms (to be confirmed by the operator); Discord: to be confirmed by the operator |
| Signed by | Operating entity |

### Pushover (critical paging)

| Field | Value |
| ----- | ----- |
| Role | Pages the on-call operator for `severity="critical"` (`pushover_configs`, emergency priority) |
| Data sent | Alert title, description and runbook URL, with the operator's Pushover user key and application token |
| Region | to be confirmed by the operator |
| Processor? | to be confirmed by the operator. The user key identifies the operator's own account |
| Mechanism | to be confirmed by the operator: DPA, SCCs or DPF as offered by Pushover |
| Signed by | Operating entity |

### Dead man's switch (`DEADMAN_URL`)

| Field | Value |
| ----- | ----- |
| Role | Receives the always-firing `Watchdog` every minute and pages when it stops. Provider chosen by the operator (`alertmanager.yml` cites healthchecks.io, Dead Man's Snitch and Better Stack as examples) |
| Data sent | Alertmanager webhook body of `Watchdog` (fixed alert, nothing about users). The ping URL is a secret |
| Region | to be confirmed by the operator (depends on the provider) |
| Processor? | No personal data except the notification contact of the operator's account |
| Mechanism | to be confirmed by the operator |
| Signed by | Operating entity |

### Off-site S3 store (backups, up to 5 years)

| Field | Value |
| ----- | ----- |
| Role | Off-site copy of every backup (ADR-0032, ADR-0033): `BACKUP_S3_BUCKET`, Object Lock compliance mode |
| Data sent | `.age` files only, encrypted before upload; the provider holds no key. Contents: dumps of activities 1–4 (no personal data, see the register) and the audit trail |
| Region | Operator-set (`BACKUP_S3_REGION`), must be an EU region: `scripts/backup-bucket-check.sh` refuses any region outside `BACKUP_S3_ALLOWED_REGIONS` in production (warning elsewhere). Provider and region: to be confirmed by the operator |
| Processor? | Storage only; the data is ciphertext to the provider. The register's position is that the dumps hold no personal data |
| Mechanism | Provider DPA (to be confirmed by the operator); no transfer mechanism with an EU region and an EU-established provider |
| Signed by | Operating entity |

### Audit-anchor S3 bucket (ADR-0027)

| Field | Value |
| ----- | ----- |
| Role | Holds the verified head of the audit hash chain (`AUDIT_ANCHOR_*`), Object Lock |
| Data sent | Chain head hash and sequence number, no event content |
| Region | Operator-set (`AUDIT_ANCHOR_REGION`, **`us-east-1` when unset** in `deploy.yml`): set it to an EU region. No automatic region check for this bucket yet. Provider and region: to be confirmed by the operator |
| Processor? | Hashes only, no personal data; a DPA is advised if the provider also hosts the backups |
| Mechanism | Same as the off-site store (to be confirmed by the operator) |
| Signed by | Operating entity |

