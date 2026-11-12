# Algorithmic Trading Compliance — MiFID II & MAR

> **Applies to:** trader-trainer service (GA + DQN agents), financial-scraper (market data inputs)  
> **Regulatory framework:** MiFID II (Art. 17, RTS 6), MAR (Art. 12, 16), ESMA guidelines  
> **Last review:** 2026-11-09

> **⚠️ No live execution.** The platform places no real order and must not do so until every prerequisite of §6 is met: kill switch, pre-trade limits (position, value, frequency), Binance terms of use for trading on `api.binance.com` (not established, see [third-party-dpas.md](third-party-dpas.md)), an annual review, a demonstrated edge (the MT4 walk-forward passes every criterion of [ADR-0030](../adr/0030-mt4-point-in-time-features-and-success-criteria.md), at least 30 days of paper trading included) and a model admission gate (§6 items 11-12). As of 2026-11-11, MT4 fails every criterion and no admission gate exists, so no real capital may be committed. The controls marked "Not implemented" below do not exist in the code.

## 1. Scope

The trading-model platform trains autonomous trading agents using Genetic Algorithm (GA) optimisation combined with Deep Q-Network (DQN) reinforcement learning. This document maps the platform's algorithmic trading pipeline against MiFID II Article 17 and Commission Delegated Regulation (EU) 2017/589 (RTS 6) requirements for algorithmic trading systems.

**Platform classification:** The platform is a research and development infrastructure for algorithmic trading strategies. In production deployment, it would be classified as an **algorithmic trading system** under MiFID II Art. 17(1).

## 2. System Characterisation (RTS 6 Art. 1)

| Requirement | Platform Implementation | Status |
|---|---|---|
| **Art. 1(1)** — Clearly describe system design and operation | Architecture documented in `docs/architecture/`, ADRs in `docs/adr/`, agent topology defined in `services/trader-trainer/src/domain/neural-network/` | ✅ Documented |
| **Art. 1(2)** — Identify trading algorithms, logic, constraints | GA population evolution + DQN policy network. Constraints: position sizing, market data window (500 candles default), train/validation split (80/20) | ✅ Implemented |
| **Art. 1(3)** — Risk management controls pre-deployment | Circuit breakers on service-to-service calls (`packages/reliability/src/circuit-breaker.ts`), exposure cap `maxExposureFraction` (1.0 in training). No order frequency limit, no kill switch | 🟡 Partial |
| **Art. 1(4)** — Business continuity arrangements | Docker Compose health checks, K8s HPA + PDB, database failover runbooks (`docs/operations/runbooks/runbook-database-failover.md`) | ✅ Documented |

## 3. Governance & Testing Requirements (RTS 6 Art. 3-5)

### 3.1 Conformance Testing (Art. 3)

The platform must demonstrate that algorithmic trading systems conform to specified design parameters:

| Test | Implementation | Evidence |
|---|---|---|
| **Market data integrity** — input validation and sanitisation | Zod schemas validate all incoming market data (`services/financial-scraper/src/adapters/outbound/binance/`) | Integration tests |
| **Agent behaviour bounds** — max exposure only | `maxExposureFraction` (1.0, set explicitly by `rl-backend.ts`, recorded in the model manifest as `riskLimits`) rejects a buy that would take the position value above that fraction of the initial cash (`services/trader-trainer/src/domain/env/trade-executor.ts`, validated in `wallet-validation.ts`). No order frequency limit exists | Unit tests |
| **Order generation validation** — no erroneous orders | Training operates in simulation mode only; no real order execution | N/A (simulation only) |
| **Kill functionality** — ability to halt trading | Not implemented. Prerequisite to any live execution (§6). Scope, triggers, re-arming and drill: [Loss Limits and Kill Switch Policy](risk-limits-policy.md) | ❌ Not implemented |

### 3.2 Stress Testing (Art. 5)

| Scenario | Platform Response |
|---|---|
| **Market data feed loss** — Binance API unavailable or geo-blocked ([ADR-0026](../adr/0026-binance-public-market-data-kept.md)) | No circuit breaker on the Binance client: 5xx, 429, 408 and network errors are retried with exponential backoff (5 attempts); 403 (WAF), 418 (IP ban) and 451 (restricted location) are not. A failed cycle persists and publishes nothing, so no message reaches `dlq-service`. Detected by `BinanceRestrictedLocation` (451), `ScrapeCyclesFailing` and `MarketDataStale`; fallbacks in [runbook-market-data-stale](../operations/runbooks/runbook-market-data-stale.md). The trainer stops training a symbol whose newest candle is older than `TRAINER_MAX_DATA_AGE_MS` (15 min) and resumes when fresh data arrives |
| **Extreme volatility** — rapid price movements | Agent uses normalised feature vectors; outlier detection in `feature-builder.ts`. No live execution risk in simulation |
| **High message volume** — HTTP broker with a durable Redis journal ([ADR-0048](../adr/0048-durable-message-journal-in-redis-streams.md)) | Per-subscriber circuit breaker, exponential backoff (10 attempts), dead letters counted and alerted (`MessagesDeadLettered`), audit-logger with back-pressure management via job queue. Accepted messages are journaled in Redis (AOF + replication): a broker restart loses none |

### 3.3 Annual Self-Assessment (Art. 6)

The platform should undergo an annual review covering:
- Agent fitness function stability and convergence behaviour
- Market data feature engineering correctness
- Training checkpoint integrity (`file-model-artifact-store.ts`)
- Validation methodology (train/validation split adequacy)
- MT4 walk-forward state against the [ADR-0030](../adr/0030-mt4-point-in-time-features-and-success-criteria.md) criteria (§6 item 11). As of 2026-11-11: the last run (2026-10-31) fails every criterion for every fitness, it predates realistic trading costs (#883) and is no longer reproducible as is since PR #589, and the paper trading criterion is open (no paper-trading runner exists)

## 4. Algorithmic Trading-Specific Risk Controls (RTS 6 Art. 12-18)

### 4.1 Order & Execution Controls

| Control | Implementation |
|---|---|
| **Max order volume/ value** | Partial: exposure cap `maxExposureFraction` only (`services/trader-trainer/src/domain/env/trade-executor.ts`): position value ≤ 1.0 × initial cash in training, no leverage. No per-order value limit |
| **Max order frequency** | Not implemented. No limit on orders per episode or per time unit; simulation only |
| **Dual-channel price validation** | Not implemented — simulation only. For production: requires independent price feed comparison |
| **Pre-trade risk checks** | Not implemented — simulation only. Required before any order flow, paper or live: [ADR-0064](../adr/0064-risk-and-execution-context-before-order-flow.md) (Proposed) |

### 4.2 Market Making Obligations (RTS 6 Art. 17-18)

Not applicable — the platform does not implement market making strategies.

## 5. MAR Compliance (Market Abuse Regulation)

### 5.1 Detection & Reporting (Art. 16)

| Requirement | Status |
|---|---|
| **Suspicious transaction detection** | Not implemented — simulation only. For production: pattern detection in agent behaviour required |
| **Order book surveillance** | Depth data ingested (`GET /api/v3/depth`) but no surveillance logic implemented |
| **Record-keeping for surveillance** | Audit-logger records all training events. 5-year retention recommended |

### 5.2 Algorithmic Trading-Specific MAR Risks

| Risk | Mitigation |
|---|---|
| **Spoofing / Layering** — placing orders with intent to cancel | Simulation-only; no real orders placed. Production: order-to-trade ratio monitoring required |
| **Quote stuffing** — high-frequency order submission | Not implemented: no cadence limit on agent actions. Simulation-only; no real orders placed |
| **Marking the close** — manipulating closing prices | Agent does not prioritise end-of-day positioning. No real execution |

## 6. Deployment Checklist for Regulated Production

When transitioning from research/simulation to production algorithmic trading, the following must be addressed:

| # | Requirement | Implementation Guide |
|---|---|---|
| 1 | Register with competent authority as algorithmic trading firm | N/A — infrastructure provider responsibility |
| 2 | Implement pre-trade risk controls (Art. 12-15) | In a Risk/Execution service separate from the model and the decision consumer, never in the api-gateway (the order path does not cross it): [ADR-0064](../adr/0064-risk-and-execution-context-before-order-flow.md) §2 (Proposed) |
| 3 | Deploy market-making obligations if applicable (Art. 17-18) | Not planned |
| 4 | Implement kill switch functionality | Not implemented. Owned by the Risk/Execution service, outside the decision component, state kept across restarts: [ADR-0064](../adr/0064-risk-and-execution-context-before-order-flow.md) §5 (Proposed); loss limits, triggers, re-arming and drill: [Loss Limits and Kill Switch Policy](risk-limits-policy.md) |
| 5 | Annual RTS 6 conformance testing | Schedule via CI/CD pipeline |
| 6 | MAR suspicious transaction reporting | Integrate audit-logger with regulatory reporting |
| 7 | Maintain algorithmic trading register | See [data-processing-register.md](data-processing-register.md) |
| 8 | Ensure latency monitoring | Implement Prometheus metrics for agent inference time |
| 9 | Establish Binance terms of use for trading on `api.binance.com` | Not established, see [third-party-dpas.md](third-party-dpas.md) |
| 10 | Annual review of this document | Last review 2026-11-09 |
| 11 | **Blocking:** demonstrated edge: the MT4 walk-forward passes every criterion of [ADR-0030](../adr/0030-mt4-point-in-time-features-and-success-criteria.md), at least 30 days of paper trading against backtest included | Not met: the 2026-10-31 run fails every criterion for every fitness (ADR-0030, Results); no paper-trading runner exists |
| 12 | **Blocking:** model admission gate: a model is used for a decision only if it meets the ADR-0030 criteria ([ADR-0049](../adr/0049-downstream-context-for-models-and-signals.md) §1.4) | Not implemented (#880): models are published without any admission check |

## 7. Cross-References

| Document | Relevance |
|---|---|
| [DPIA](dpia.md) — Risk 2 (secret key exposure) | SPIFFE workload identity (X.509 SVIDs issued by SPIRE, ADR-0011) |
| [Data Retention Policy](data-retention-policy.md) — 5-year retention | Training data and agent checkpoints retention |
| [Data Processing Register](data-processing-register.md) — Activity 5 | ML training data processing classification |
| `services/trader-trainer/src/` | Agent training source code |
| `docs/adr/0001-ga-dqn-training.md` | Architecture decision for GA/DQN approach |
| `docs/operations/runbooks/runbook-service-down.md` | Service recovery procedures |
