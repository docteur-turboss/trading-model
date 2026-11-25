# Third-Party Data Processing Agreements

## Binance API

**Status:** Assessment completed — DPA not required

### Nature of Data Exchange

The financial-scraper service fetches **market data only** from Binance's public REST API:

| Endpoint                        | Data Retrieved                                 |
| ------------------------------- | ---------------------------------------------- |
| `GET /api/v3/klines`            | OHLCV candles (open, high, low, close, volume) |
| `GET /api/v3/depth`             | Order book snapshots (bids, asks)              |
| `GET /api/v3/ticker/24hr`       | 24-hour statistics                             |

The three endpoints above are the only ones called, all public. No request is signed and no Binance account exists: `BINANCE_API_KEY` / `BINANCE_API_SECRET` are read by no code.

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
e-mail must be a functional, non-nominative address (a dedicated project alias,
never a person's e-mail), so no personal data is sent. It reaches every source
(SEC EDGAR, NWS and Wikimedia in the United States included; see the
[register](data-processing-register.md), activity 1); it is kept out of the public
repository (`.env`, GitHub environment secret).

Sources are ranked by their terms (ADR-0075, `accessPolicy`): rank 1 is free for
any use, trading included (`public-domain` or `attribution`); rank 2 is
`non-commercial`, marked with its `restrictions`, and accepted only when no
rank 1 source gives the same data. Terms as declared in the registry (first
checked 2026-11-04); one row per provider, every source id listed:

| Source | Data received | PII received? | Terms |
| ------ | ------------- | ------------- | ----- |
| ECB Data Portal (`data-api.ecb.europa.eu`): `ecb-aaa-yield-10y`, `ecb-hicp-annual-rate`, `ecb-deposit-facility-rate`, `ecb-euro-reference-rates` | Euro area yields, HICP, deposit rate, reference rates | No | [Free reuse](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html), commercial included, "Source: ECB statistics", data not modified |
| SEC EDGAR (`data.sec.gov`, United States): `sec-edgar-eps-diluted`, `sec-edgar-revenue`, `sec-edgar-core-facts` | XBRL facts of company filings | No | [SEC data access terms](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data), cite the SEC; fair access: User-Agent with a contact e-mail, at most 10 requests/s |
| US National Weather Service (`api.weather.gov`): `nws-kansas-wheat-belt` | Latest observation of a weather station (Hutchinson, Kansas) | No | [Public domain](https://www.weather.gov/disclaimer), no endorsement implied; User-Agent required |
| Twelve Data (`api.twelvedata.com`): `twelvedata-daily-prices` (rank 2, `non-commercial`) | Daily prices of equities and ETFs | No | Free tier, internal use: §2.3(l) no "Use Free Tier data for commercial purposes"; §16.2(a) data deleted within 30 days of termination ([terms](https://twelvedata.com/terms)); API key and User-Agent sent |
| Wikimedia Analytics API (`wikimedia.org`): `wikipedia-pageviews` | Daily views of Wikipedia articles | No: counts only | [CC0 1.0](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html); User-Agent with a contact required |
| US Treasury (United States): `treasury-par-yield-curve` | Par yield curve | No | [Public domain](https://www.law.cornell.edu/uscode/text/17/105) (17 U.S.C. §105), cite the Treasury; no key |
| CFTC (United States): `cftc-cot-legacy` | Commitments of Traders, legacy report | No | [Public domain](https://www.cftc.gov/webpolicy/index.htm), cite the CFTC; no key |
| NASA POWER (United States): `nasa-power-crop-regions` | Weather series of crop regions | No | [Attribution](https://power.larc.nasa.gov/docs/referencing/), "NASA Langley Research Center POWER Project"; no key |
| FRED (United States): `fred-us-macro` | US macro series | No | [Attribution](https://fred.stlouisfed.org/docs/api/terms_of_use.html), "not endorsed or certified by the Federal Reserve Bank of St. Louis"; API key (`SIGNAL_KEY_FRED`, project account) sent |
| Federal Register (United States): `federal-register-documents` | Published federal documents | No | [Public domain](https://www.govinfo.gov/about/policies); no key |
| Eurostat: `eurostat-house-price-index`, `eurostat-hicp-inflation`, `eurostat-unemployment` | Price, inflation and unemployment indices | No | [Attribution](https://ec.europa.eu/eurostat/help/copyright-notice), "Source: Eurostat"; no key |
| DGFiP / Etalab (France): `dvf-commune-sales` | Real-estate sales by commune | No | [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/), cite DGFiP; no key |
| EIA (United States): `eia-weekly-energy` | Weekly energy statistics | No | [Public domain](https://www.eia.gov/about/copyrights_reuse.php), cite the EIA; API key (`SIGNAL_KEY_EIA`, project account) sent |

Rejected for their terms: Open-Meteo's free API (non-commercial only) and
Binance's `data-api.binance.vision` (CC BY-NC-SA 4.0, no live trading); no
licence was found for Mastodon API data.

A formal DPA is not required for the same reasons as Binance: public data
sources, not processors, and no personal data received.

## Other Third Parties

| Third Party        | Role                | PII? | DPA Required?                      |
| ------------------ | ------------------- | ---- | ---------------------------------- |
| Binance API        | Market data source  | No   | No — documented above              |
| Every signal source of the registry (table above) | Signal sources (ADR-0036) | No | No — documented above |
| GitHub Actions     | CI/CD pipeline      | No   | No — no data processed             |
| Docker Hub / GHCR  | Container registry  | No   | No — infrastructure only           |
| Discord            | Alert notifications | No (alert text) | No — not a processor, no DPA offered; SCCs + DPF — sheet below |
| Pushover           | Critical alert paging | No (alert text) | No — not a processor, no DPA offered; SCCs — sheet below |
| healthchecks.io    | Heartbeat of Watchdog | No | No — not a processor, EU provider, no DPA offered — sheet below |
| Off-site S3 store  | Encrypted backups   | No (age-encrypted) | to be confirmed by the operator — sheet below |
| Audit-anchor S3 bucket | Audit chain anchors | No (hashes) | to be confirmed by the operator — sheet below |
| Prometheus/Grafana | Internal monitoring | No   | No — self-hosted, no external data |

Monitoring, tracing and logging infrastructure (Prometheus, Grafana, Jaeger, Loki) is self-hosted. The alert receivers, the dead man's switch and the S3 stores below are external services chosen and contracted by the operating entity; the repository holds no contract or DPA with any of them.

## Operator-chosen Services

The repository neither signs a DPA nor picks a provider. The operating entity signs and records provider, region and contract. "to be confirmed by the operator" marks an answer that depends on the provider chosen and is not invented here.

Provider terms below were read on 2026-11-23 from the providers' public privacy policies; re-read them before the first production deploy.

### Discord (alert webhook)

| Field | Value |
| ----- | ----- |
| Provider | Discord (operator's choice, already in use). EEA controller: Discord Netherlands BV; Discord Inc. (United States) elsewhere |
| Role | Receives alert notifications (`slack_configs` of `deploy/k8s/infra/config/alertmanager.yml`, pointed at a Discord `/slack` webhook endpoint). Channels `#alerts`, `#alerts-warning` |
| Data sent | Alert name, severity, job (service) name, summary, description, runbook URL. No personal data by design (labels carry pod and service names; application logs are not sent) |
| Region | United States: Discord "process[es] and store[s] information on servers located in the United States" ([privacy policy](https://discord.com/privacy)) |
| Processor? | No: alert text holds no personal data. Only if a message ever contains personal data (an operator's name in a description); the operators' own accounts are the provider's own processing |
| Mechanism | Standard Contractual Clauses (Modules 1 and 2) and the EU-US Data Privacy Framework, per the privacy policy. Discord offers no DPA for webhook use |
| Signed by | Nothing to sign: no DPA offered; the operator's account accepts Discord's terms |

### Pushover (critical paging)

| Field | Value |
| ----- | ----- |
| Role | Pages the on-call operator for `severity="critical"` (`pushover_configs`, emergency priority) |
| Data sent | Alert title, description and runbook URL, with the operator's Pushover user key and application token |
| Provider | Pushover, LLC (United States) |
| Region | United States: Pushover "processes data on servers located in the United States" ([privacy policy](https://pushover.net/privacy)) |
| Processor? | No: alert text holds no personal data. The user key identifies the operator's own Pushover account, which is Pushover's own processing under its terms |
| Mechanism | Standard Contractual Clauses "where required by applicable law", per the privacy policy. Pushover is not listed under the Data Privacy Framework and offers no DPA |
| Signed by | Nothing to sign: no DPA offered; the operator's account accepts Pushover's terms |

### Dead man's switch (`DEADMAN_URL`)

| Field | Value |
| ----- | ----- |
| Role | Receives the always-firing `Watchdog` every minute and pages when it stops. Provider chosen by the operator (`alertmanager.yml` cites healthchecks.io, Dead Man's Snitch and Better Stack as examples) |
| Provider | healthchecks.io, run by SIA Monkey See Monkey Do (Latvia, EU) |
| Data sent | Alertmanager webhook body of `Watchdog` (fixed alert, nothing about users). The ping URL is a secret |
| Region | EU provider; monitoring hosted at Hetzner, encrypted database backups at AWS ([privacy policy](https://healthchecks.io/privacy/)); the policy names no country for either |
| Processor? | No personal data except the notification contact of the operator's account |
| Mechanism | None needed for the provider (EU-established). Its policy says sub-processors may operate outside the EEA, without naming the safeguard |
| Signed by | Nothing to sign: no DPA offered; the operator's account accepts healthchecks.io's terms |

### Off-site S3 store (backups, up to 5 years)

| Field | Value |
| ----- | ----- |
| Role | Off-site copy of every backup (ADR-0032, ADR-0033): `BACKUP_S3_BUCKET`, Object Lock compliance mode; optional second copy at another provider, `BACKUP_S3_SECONDARY_BUCKET`, same rules and same DPA requirement |
| Data sent | `.age` files only, encrypted before upload; the provider holds no key. Contents: dumps of activities 1–4 (no personal data, see the register) and the audit trail (only the pseudonymous API key name `actor`, register activity 8) |
| Region | Operator-set (`BACKUP_S3_REGION`), must be an EU region: `scripts/backup-bucket-check.sh` refuses any region outside `BACKUP_S3_ALLOWED_REGIONS` in production (warning elsewhere). Provider and region: to be confirmed by the operator |
| Processor? | Storage only; the data is ciphertext to the provider. The register's position is that the dumps hold no personal data beyond the pseudonymous key name in the audit trail (activity 8) |
| Mechanism | Provider DPA (to be confirmed by the operator); no transfer mechanism with an EU region and an EU-established provider |
| Signed by | Operating entity |

### Audit-anchor S3 bucket (ADR-0027)

| Field | Value |
| ----- | ----- |
| Role | Holds the verified head of the audit hash chain (`AUDIT_ANCHOR_*`), Object Lock |
| Data sent | Chain head hash and sequence number, no event content |
| Region | Operator-set (`AUDIT_ANCHOR_REGION`): `deploy.yml` checks it against the EU list (error in production, warning elsewhere; also read from the existing `audit-anchor-s3` Secret when the variable is empty). Provider and region: to be confirmed by the operator |
| Processor? | Hashes only, no personal data; a DPA is advised if the provider also hosts the backups |
| Mechanism | Same as the off-site store (to be confirmed by the operator) |
| Signed by | Operating entity |

