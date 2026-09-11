# Algorithmic Trading Compliance — MiFID II & MAR

> **Applies to:** trader-trainer service (GA + DQN agents), financial-scraper (market data inputs)  
> **Regulatory framework:** MiFID II (Art. 17, RTS 6), MAR (Art. 12, 16), ESMA guidelines  
> **Last review:** 2026-06

## 1. Scope

The trading-model platform trains autonomous trading agents using Genetic Algorithm (GA) optimisation combined with Deep Q-Network (DQN) reinforcement learning. This document maps the platform's algorithmic trading pipeline against MiFID II Article 17 and Commission Delegated Regulation (EU) 2017/589 (RTS 6) requirements for algorithmic trading systems.

**Platform classification:** The platform is a research and development infrastructure for algorithmic trading strategies. In production deployment, it would be classified as an **algorithmic trading system** under MiFID II Art. 17(1).

## 2. System Characterisation (RTS 6 Art. 1)

| Requirement | Platform Implementation | Status |
|---|---|---|
| **Art. 1(1)** — Clearly describe system design and operation | Architecture documented in `docs/architecture/`, ADRs in `docs/adr/`, agent topology defined in `services/trader-trainer/src/neural-network/` | ✅ Documented |
| **Art. 1(2)** — Identify trading algorithms, logic, constraints | GA population evolution + DQN policy network. Constraints: position sizing, market data window (500 candles default), train/validation split (80/20) | ✅ Implemented |
| **Art. 1(3)** — Risk management controls pre-deployment | Circuit breakers (`@trading-model/common/reliability/circuit-breaker.ts`), rate limiting, position limits validated in env schema | ✅ Implemented |
| **Art. 1(4)** — Business continuity arrangements | Docker Compose health checks, K8s HPA + PDB, database failover runbooks (`docs/operations/runbooks/runbook-database-failover.md`) | ✅ Documented |

## 3. Governance & Testing Requirements (RTS 6 Art. 3-5)

### 3.1 Conformance Testing (Art. 3)

The platform must demonstrate that algorithmic trading systems conform to specified design parameters:

| Test | Implementation | Evidence |
|---|---|---|
| **Market data integrity** — input validation and sanitisation | Zod schemas validate all incoming market data (`services/financial-scraper/src/clients/binance/`). SSRF protection (`@trading-model/common/utils/ssrf-protection.ts`) | Integration tests |
| **Agent behaviour bounds** — max position, max order frequency | Enforced via agent environment constraints in `services/trader-trainer/src/environment/` | Unit tests |
| **Order generation validation** — no erroneous orders | Training operates in simulation mode only; no real order execution | N/A (simulation only) |
| **Kill functionality** — ability to halt trading | Not implemented in simulation. Production deployment requires a circuit breaker at the api-gateway level | 🟡 Planned |

### 3.2 Stress Testing (Art. 5)

| Scenario | Platform Response |
|---|---|
| **Market data feed loss** — Binance API unavailable | `circuit-breaker.ts` opens after configurable failure threshold. `dlq-service` captures failed messages. Agent pauses training and awaits data recovery |
| **Extreme volatility** — rapid price movements | Agent uses normalised feature vectors; outlier detection in `feature-builder.ts`. No live execution risk in simulation |
| **High message volume** — Redis Streams backpressure | Stream MAXLEN ~500000, DLQ with adaptive backoff, audit-logger with back-pressure management via job queue |

### 3.3 Annual Self-Assessment (Art. 6)

The platform should undergo an annual review covering:
- Agent fitness function stability and convergence behaviour
- Market data feature engineering correctness
- Training checkpoint integrity (`checkpoint-manager.ts`)
- Validation methodology (train/validation split adequacy)

## 4. Algorithmic Trading-Specific Risk Controls (RTS 6 Art. 12-18)

### 4.1 Order & Execution Controls

| Control | Implementation |
|---|---|
| **Max order volume/ value** | Enforced in agent action space definition (`services/trader-trainer/src/environment/`) |
| **Max order frequency** | Configurable via `MAX_ORDERS_PER_EPISODE` env var |
| **Dual-channel price validation** | Not implemented — simulation only. For production: requires independent price feed comparison |
| **Pre-trade risk checks** | Not implemented — simulation only. For production: requires integration with market gateway |

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
| **Quote stuffing** — high-frequency order submission | Agent action cadence limited by `action_interval` in environment config |
| **Marking the close** — manipulating closing prices | Agent does not prioritise end-of-day positioning. No real execution |

## 6. Deployment Checklist for Regulated Production

When transitioning from research/simulation to production algorithmic trading, the following must be addressed:

| # | Requirement | Implementation Guide |
|---|---|---|
| 1 | Register with competent authority as algorithmic trading firm | N/A — infrastructure provider responsibility |
| 2 | Implement pre-trade risk controls (Art. 12-15) | Add order validation middleware in api-gateway |
| 3 | Deploy market-making obligations if applicable (Art. 17-18) | Not planned |
| 4 | Implement kill switch functionality | Add circuit breaker webhook at gateway level |
| 5 | Annual RTS 6 conformance testing | Schedule via CI/CD pipeline |
| 6 | MAR suspicious transaction reporting | Integrate audit-logger with regulatory reporting |
| 7 | Maintain algorithmic trading register | See [data-processing-register.md](data-processing-register.md) |
| 8 | Ensure latency monitoring | Implement Prometheus metrics for agent inference time |

## 7. Cross-References

| Document | Relevance |
|---|---|
| [DPIA](dpia.md) — Risk 2 (secret key exposure) | Certificate-based agent identity in mTLS |
| [Data Retention Policy](data-retention-policy.md) — 5-year retention | Training data and agent checkpoints retention |
| [Data Processing Register](data-processing-register.md) — Activity 5 | ML training data processing classification |
| `services/trader-trainer/src/` | Agent training source code |
| `docs/adr/0001-ga-dqn-training.md` | Architecture decision for GA/DQN approach |
| `docs/operations/runbooks/runbook-service-down.md` | Service recovery procedures |
