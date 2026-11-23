# Compliance Framework

> **Last review:** 2026-11

Map of the regulations that apply to the platform. Processing activities: [Data Processing Register](data-processing-register.md). Document inventory: [README](README.md).

## 1. Regulatory Applicability Matrix

| Regulation | Scope | Applicable | Rationale |
|---|---|---|---|
| **GDPR** (EU) 2016/679 | Data protection and privacy | ✅ Yes | Platform operates in EU jurisdiction. Art. 30 register required regardless of data type |
| **MiFID II** Directive 2014/65/EU | Financial instruments, algorithmic trading | ⚠️ If operated by an investment firm / financial entity; research by a natural person today | Algorithmic trading research on financial instruments |
| **MAR** Regulation (EU) 596/2014 | Market abuse prevention | ⚠️ If operated by an investment firm / financial entity; research by a natural person today | Agents could generate manipulative patterns |
| **DORA** Regulation (EU) 2022/2554 | Digital operational resilience | ⚠️ If operated by an investment firm / financial entity; research by a natural person today | ICT risk management, incident reporting, resilience testing |
| **PCI-DSS** | Payment card data | ❌ No | No payment card data processed |
| **CCPA** (California) | Consumer privacy | ❌ No | No consumer data processed; only truncated caller IPs in API access logs |
| **LGPD** (Brazil) | Data protection | ❌ No | No Brazilian personal data. GDPR equivalence sufficient |
| **SOX** (US) | Financial reporting | ❌ No | Not a publicly traded company |

## 2. Control Mapping by Regulation

### 2.1 MiFID II Control Map

| Article / RTS | Requirement | Platform Control | Document Reference |
|---|---|---|---|
| **Art. 17(1)** | Algorithmic trading governance | System design documented, conformance testing framework defined | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §3 |
| **Art. 17(2)** | Risk controls for algo trading | Circuit breakers, rate limiting, agent behaviour bounds | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §4 |
| **Art. 72** | Record-keeping (5 years) | 5-year retention: market data in MySQL (ADR-0051), audit, training and DLQ events in the audit trail (ADR-0027) | [Data Retention Policy](data-retention-policy.md) |
| **RTS 6 Art. 1** | System characterisation | Architecture docs, ADRs, neural network topology documentation | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §2 |
| **RTS 6 Art. 3** | Conformance testing | Market data validation, agent behaviour bounds, order generation testing | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §3.1 |
| **RTS 6 Art. 5** | Stress testing | Feed loss, volatility, backpressure scenarios | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §3.2 |
| **RTS 6 Art. 12-18** | Risk controls (pre-trade/post-trade) | Implemented at simulation level; production checklist defined | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §6 |

### 2.2 MAR Control Map

| Article | Requirement | Platform Control | Document Reference |
|---|---|---|---|
| **Art. 12** | Market manipulation definitions | Agent behaviour patterns assessed against spoofing, layering, quote stuffing | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §5.2 |
| **Art. 16** | Suspicious transaction reporting | Audit trail enables reconstruction; automated detection not yet implemented | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §5.1 |
| **Art. 17** | Public disclosure of inside information | Not applicable — no inside information processed | — |

### 2.3 DORA Control Map

| Article | Requirement | Platform Control |
|---|---|---|
| **Art. 5-8** | ICT risk management framework | ISMS aligned with ISO 27001 (see [Information Security Policy](information-security-policy.md)) |
| **Art. 9-10** | ICT incident management | [Incident Response Policy](incident-response-policy.md) with classification levels |
| **Art. 11-13** | Digital operational resilience testing | CI/CD pipeline, contract tests, E2E tests, weekly Stryker mutation run (`mutation-testing.yml`, `break: 50`; scope in [testing standards](../standards/testing-standards.md)) |
| **Art. 14-16** | Third-party ICT risk | [Third-Party DPAs](third-party-dpas.md) assessment |
| **Art. 17-23** | Information sharing, register of information | Processing register maintained |
| **Art. 24-26** | Oversight framework for critical third parties | Binance API assessed as non-critical data source; its availability from the EU after Binance's MiCA exit is tracked in [ADR-0026](../adr/0026-binance-public-market-data-kept.md) |

## 3. Regulatory Calendar

| Frequency | Activity | Responsible |
|---|---|---|
| **Quarterly** | Review data processing register for accuracy | Platform Security Lead |
| **Quarterly** | Review third-party assessments | Platform Security Lead |
| **Annual** | Full DPIA review | Platform Security Lead |
| **Annual** | Information security policy review | Platform Security Lead |
| **Annual** | Algorithmic trading conformance self-assessment | Lead Developer |
| **Annual** | Access control audit | Platform Security Lead |
| **Annual** | Incident response tabletop exercise | Platform Security Lead |
| **Annual** | Business continuity plan test | DevOps Lead |
| **Ad-hoc** | Any significant change to architecture or data processing | Platform Security Lead |

## 4. Regulatory Contact

| Authority | Regulation | Notification Period |
|---|---|---|
| **CNIL** (FR) | GDPR | 72h for personal data breach (Art. 33) |
| **AMF** (FR) | MiFID II, MAR | 24h for algorithmic trading incidents |
| **ACPR** (FR) / **ECB** | DORA | 24h for major ICT incidents |

Not applicable at current research stage — contacts listed for production deployment readiness.
