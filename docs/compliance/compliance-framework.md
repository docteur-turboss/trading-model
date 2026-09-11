# Compliance Framework

> **Version:** 1.0  
> **Effective:** 2026-06  
> **Last review:** 2026-06  
> **Applicable regulations:** GDPR, MiFID II, MAR, DORA

## 1. Purpose

This document provides a consolidated map of all regulatory obligations applicable to the trading-model platform and the technical controls that satisfy them. It serves as the entry point for compliance assessment and audit preparation.

## 2. Regulatory Applicability Matrix

| Regulation | Scope | Applicable | Rationale |
|---|---|---|---|
| **GDPR** (EU) 2016/679 | Data protection and privacy | ✅ Yes | Platform operates in EU jurisdiction. Art. 30 register required regardless of data type |
| **MiFID II** Directive 2014/65/EU | Financial instruments, algorithmic trading | ✅ Yes | Platform performs algorithmic trading research on financial instruments |
| **MAR** Regulation (EU) 596/2014 | Market abuse prevention | ✅ Yes | Algorithmic trading agents could potentially generate manipulative patterns |
| **DORA** Regulation (EU) 2022/2554 | Digital operational resilience | ✅ Yes | ICT risk management, incident reporting, resilience testing for financial sector |
| **PCI-DSS** | Payment card data | ❌ No | No payment card data processed |
| **CCPA** (California) | Consumer privacy | ❌ No | No California residents' data processed. Zero personal data architecture |
| **LGPD** (Brazil) | Data protection | ❌ No | No Brazilian personal data. GDPR equivalence sufficient |
| **SOX** (US) | Financial reporting | ❌ No | Not a publicly traded company |

## 3. Control Mapping by Regulation

### 3.1 GDPR Control Map

| GDPR Article | Requirement | Platform Control | Document Reference |
|---|---|---|---|
| **Art. 5(1)(c)** | Data minimisation | Zero personal data architecture — machine-generated data only | [DPIA](dpia.md) §2 |
| **Art. 5(1)(e)** | Storage limitation | TTL-based retention policies across all data stores | [Data Retention Policy](data-retention-policy.md) |
| **Art. 6(1)(f)** | Legitimate interest basis | Documented for all 5 processing activities | [Data Processing Register](data-processing-register.md) |
| **Art. 25** | Data protection by design and by default | mTLS, encryption at rest, log redaction, append-only audit | [DPIA](dpia.md) §4 |
| **Art. 30** | Register of processing activities | 5 activities documented with full metadata | [Data Processing Register](data-processing-register.md) |
| **Art. 32** | Security of processing | mTLS, encryption, RBAC, circuit breakers, SSRF protection | [Information Security Policy](information-security-policy.md) |
| **Art. 33** | Breach notification | Incident response policy with 72h notification | [Incident Response Policy](incident-response-policy.md) |
| **Art. 35** | DPIA requirement | Completed DPIA — no Art. 36 consultation required | [DPIA](dpia.md) |
| **Art. 44-49** | International transfers | Binance API data transfer assessed — no personal data involved | [Third-Party DPAs](third-party-dpas.md) |

### 3.2 MiFID II Control Map

| Article / RTS | Requirement | Platform Control | Document Reference |
|---|---|---|---|
| **Art. 17(1)** | Algorithmic trading governance | System design documented, conformance testing framework defined | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §3 |
| **Art. 17(2)** | Risk controls for algo trading | Circuit breakers, rate limiting, agent behaviour bounds | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §4 |
| **Art. 72** | Record-keeping (5 years) | 5-year retention for market data and audit events | [Data Retention Policy](data-retention-policy.md) |
| **RTS 6 Art. 1** | System characterisation | Architecture docs, ADRs, neural network topology documentation | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §2 |
| **RTS 6 Art. 3** | Conformance testing | Market data validation, agent behaviour bounds, order generation testing | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §3.1 |
| **RTS 6 Art. 5** | Stress testing | Feed loss, volatility, backpressure scenarios | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §3.2 |
| **RTS 6 Art. 12-18** | Risk controls (pre-trade/post-trade) | Implemented at simulation level; production checklist defined | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §6 |

### 3.3 MAR Control Map

| Article | Requirement | Platform Control | Document Reference |
|---|---|---|---|
| **Art. 12** | Market manipulation definitions | Agent behaviour patterns assessed against spoofing, layering, quote stuffing | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §5.2 |
| **Art. 16** | Suspicious transaction reporting | Audit trail enables reconstruction; automated detection not yet implemented | [Algorithmic Trading Compliance](algorithmic-trading-compliance.md) §5.1 |
| **Art. 17** | Public disclosure of inside information | Not applicable — no inside information processed |

### 3.4 DORA Control Map

| Article | Requirement | Platform Control |
|---|---|---|
| **Art. 5-8** | ICT risk management framework | ISMS aligned with ISO 27001 (see [Information Security Policy](information-security-policy.md)) |
| **Art. 9-10** | ICT incident management | [Incident Response Policy](incident-response-policy.md) with classification levels |
| **Art. 11-13** | Digital operational resilience testing | CI/CD pipeline, contract tests, E2E tests, mutation testing (Stryker) |
| **Art. 14-16** | Third-party ICT risk | [Third-Party DPAs](third-party-dpas.md) assessment |
| **Art. 17-23** | Information sharing, register of information | Processing register maintained |
| **Art. 24-26** | Oversight framework for critical third parties | Binance API assessed as non-critical data source |

## 4. Compliance Artifact Inventory

| Artifact | Location | Regulation | Owner |
|---|---|---|---|
| DPIA (Data Protection Impact Assessment) | `docs/compliance/dpia.md` | GDPR Art. 35 | Platform Security Lead |
| Data Processing Register | `docs/compliance/data-processing-register.md` | GDPR Art. 30 | Platform Security Lead |
| Data Retention Policy | `docs/compliance/data-retention-policy.md` | GDPR Art. 5, MiFID II 72 | Platform Security Lead |
| Third-Party DPA Assessment | `docs/compliance/third-party-dpas.md` | GDPR Art. 28, DORA Art. 14-16 | Platform Security Lead |
| Algorithmic Trading Compliance | `docs/compliance/algorithmic-trading-compliance.md` | MiFID II Art. 17, RTS 6, MAR | Lead Developer |
| Information Security Policy | `docs/compliance/information-security-policy.md` | ISO 27001, DORA Art. 5-8 | Platform Security Lead |
| Access Control Policy | `docs/compliance/access-control-policy.md` | GDPR Art. 32, ISO 27001 8.x | Platform Security Lead |
| Incident Response Policy | `docs/compliance/incident-response-policy.md` | GDPR Art. 33, DORA Art. 9-10 | Platform Security Lead |
| Business Continuity Policy | `docs/compliance/business-continuity-policy.md` | DORA Art. 11-13 | Platform Security Lead |

## 5. Audit Readiness Checklist

| Requirement | Status | Evidence |
|---|---|---|
| Processing activities documented | ✅ Complete | `data-processing-register.md` — 5 activities |
| DPIA performed | ✅ Complete | `dpia.md` — No Art. 36 consultation needed |
| Data retention policy defined | ✅ Complete | `data-retention-policy.md` — All data types covered |
| Third-party risk assessed | ✅ Complete | `third-party-dpas.md` — Binance + infrastructure |
| Information security policy documented | ✅ Complete | `information-security-policy.md` — 14 ISO domains |
| Algorithmic trading compliance mapped | ✅ Complete | `algorithmic-trading-compliance.md` — Articles mapped |
| Access control procedure documented | ✅ Complete | `access-control-policy.md` — mTLS + ACL |
| Incident response procedure documented | ✅ Complete | `incident-response-policy.md` — 4 severity levels |
| Business continuity plan documented | ✅ Complete | `business-continuity-policy.md` — RTO/RPO targets |
| Technical controls implemented | ✅ Complete | See evidence in each policy document |
| Annual review schedule established | ✅ Complete | Annual review cadence defined per document |

## 6. Regulatory Calendar

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

## 7. Regulatory Contact

| Authority | Regulation | Notification Period |
|---|---|---|
| **CNIL** (FR) | GDPR | 72h for personal data breach (Art. 33) |
| **AMF** (FR) | MiFID II, MAR | 24h for algorithmic trading incidents |
| **ACPR** (FR) / **ECB** | DORA | 24h for major ICT incidents |

Not applicable at current research stage — contacts listed for production deployment readiness.
