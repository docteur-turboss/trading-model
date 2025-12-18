# AI Trading Platform

## Overview

This repository hosts a **microservices-based AI trading platform** designed to ingest heterogeneous data sources (social, financial, economic, and market data), predict future price movements using **Transformer-based models**, and train an autonomous trading agent via **Deep Reinforcement Learning**, optimized by a **Genetic Algorithm**.

The system is intended to **execute real market orders**, while remaining strictly controlled by a **central monitoring service** enforcing risk limits, safety constraints, and execution policies.

This project is currently in an **early development phase**.

## High-Level Architecture

The platform is built as a **distributed system**, following microservice principles:

* Independent services with clear responsibilities
* Secure service-to-service communication (HTTPS / mTLS)
* Event-driven and API-based interactions
* Centralized supervision for live trading execution

```
Data Sources ──▶ Scrapers ──▶ Feature Pipelines ──▶ Models
                                              │
                                              ▼
                                        Trader (DRL)
                                              │
                                              ▼
                                    Central Monitor
                                              │
                                              ▼
                                      Market Execution
```

## Data Sources

The system is designed to aggregate and correlate multiple categories of signals:

* **Social data**

  * Sentiment, trends, public discourse (planned)
* **Financial data**

  * Company-level metrics and market data
* **Economic data**

  * State-level indicators (e.g. unemployment, inflation)
* **Market data**

  * Price, volume, order book, volatility


## Current Project Status

### ❌ Implemented

* Nothing is considered stable or production-ready yet

### 🚧 In Progress
#### Service Discovery
* Central registry for microservices
* Handles dynamic service registration and discovery
* Designed to support:
  * containerized environments
  * secure communication (mTLS)

#### Financial Scraper
* Initial implementation using **Binance API**
* Responsible for:
  * fetching market data
  * normalizing and publishing financial signals
* This is a temporary data source, subject to change

#### Mail Service
* Internal messaging service between microservices
* Intended for:
  * event notifications
  * alerts
  * asynchronous communication
* Not user-facing email delivery

#### Trader
* Core trading logic
* Uses a **Genetic Algorithm** to evolve trading agents
* Agents are trained via **Deep Reinforcement Learning**
* Still experimental and not connected to live execution

## Planned Components (Non-Exhaustive)
* Social data scrapers (news, social media)
* Economic data ingestion (macro indicators)
* Transformer-based prediction models
* Feature stores and time-series pipelines
* Backtesting and simulation environment
* Central monitoring & risk control service
* Execution engine with broker abstraction
* Observability (metrics, logs, alerts)

## Security Model
* All inter-service communication is expected to use **HTTPS with mutual TLS**
* No service trusts another without explicit certificate validation
* Live trading execution will be gated by:
  * risk limits
  * capital exposure constraints
  * fail-safe mechanisms

See [`SECURITY.md`](./SECURITY.md) for responsible disclosure and security policies.

## Disclaimer
⚠️ **This project is experimental.**

* It is **not audited**
* It is **not production-ready**
* It may interact with **real financial markets**
* Improper use can lead to **financial loss**

Use at your own risk.

## License
This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

* Non-commercial use only
* Research, experimentation, and personal use are permitted
* Commercial usage requires explicit authorization

See [`LICENSE`](./LICENSE.md) for full terms.

## Contributing
Contributions are welcome for:
* research
* experimentation
* architecture discussions

By contributing, you agree that your contributions are licensed under the same license as the project.

## Roadmap Philosophy
This project prioritizes:
* correctness over speed
* safety over performance
* observability over blind automation

No component will be considered production-ready without:
* explicit testing
* documented assumptions
* clear failure modes

## Contact
For security-related issues, see [`SECURITY.md`](./SECURITY.md).
For general discussions or architecture questions, open an issue.

**Status:** 🚧 Early Development
**Type:** Research / Experimental AI Trading System
