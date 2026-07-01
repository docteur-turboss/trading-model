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
- Integration code: `services/financial-scraper/src/clients/binance/`

## Other Third Parties

| Third Party        | Role                | PII? | DPA Required?                      |
| ------------------ | ------------------- | ---- | ---------------------------------- |
| Binance API        | Market data source  | No   | No — documented above              |
| GitHub Actions     | CI/CD pipeline      | No   | No — no data processed             |
| Docker Hub / GHCR  | Container registry  | No   | No — infrastructure only           |
| Prometheus/Grafana | Internal monitoring | No   | No — self-hosted, no external data |

All monitoring, tracing, and logging infrastructure (Prometheus, Grafana, Jaeger, Loki) is self-hosted within the platform's own infrastructure. No third-party observability services are used.
