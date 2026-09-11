# Data Protection Impact Assessment (DPIA)

> **Performed:** 2026-06  
> **Assessment scope:** trading-model platform (all 8 services, 6 packages)  
> **Methodology:** CNIL PIA framework (Art. 35 GDPR)

## 1. System Overview

The trading-model platform is a microservices-based algorithmic trading research infrastructure. It ingests market data from Binance, trains machine learning trading agents via genetic algorithms and deep Q-learning, and routes inter-service messages through an internal message bus. It has no human users, no authentication for individuals, and no collection of personal data.

**Key characteristics:**

- 8 backend microservices (Node.js/TypeScript/Express)
- Event-driven architecture (message-manager on Redis Streams)
- mTLS via SPIFFE/SPIRE workload identity (ADR-0011)
- Self-hosted databases (MongoDB, MySQL, Redis)
- React SPA admin dashboard (admin-interface)

## 2. Necessity and Proportionality Assessment

| Question                                  | Answer | Justification                                                                                                                                                     |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is personal data collected?               | **No** | All data is machine-generated (market prices, service metadata, operational logs). No names, emails, IPs of individuals, device IDs, or any Art. 4(1) identifiers |
| Could the system function with less data? | N/A    | The system already operates with the minimum data necessary: trading symbols + numeric market data                                                                |
| Are data subjects informed?               | N/A    | No data subjects exist to inform                                                                                                                                  |
| Is consent required?                      | **No** | Art. 6(1)(f) — legitimate interest applies. No human interaction occurs                                                                                           |
| Is profiling performed?                   | **No** | The system makes no decisions about individuals. ML agents make trading decisions on synthetic/market data                                                        |

## 3. Risk Analysis

### Risk 1: Accidental Introduction of Personal Data

| Dimension       | Assessment                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Likelihood**  | Low — no user creation endpoints exist. Only service-to-service communication                                                                                                                                             |
| **Impact**      | Medium — if PII accidentally entered via log messages or payloads                                                                                                                                                         |
| **Severity**    | Acceptable                                                                                                                                                                                                                |
| **Mitigations** | Triple-layer log redaction (Pino redact paths × 16 patterns, JSON stringifier regex × 15 patterns, PEM sanitization). Payload sanitizer anti-injection. If PII is ever introduced, these layers redact before persistence |

### Risk 2: Secret Key Exposure

| Dimension       | Assessment                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Likelihood**  | Low — mTLS everywhere, SecureKeyStore, AES-256-GCM at rest, automountServiceAccountToken: false                   |
| **Impact**      | High — compromise of SPIRE CA keys / SVIDs or service tokens could disrupt platform security                                    |
| **Severity**    | Tolerable (not PII-related)                                                                                       |
| **Mitigations** | Automatic SVID rotation (1h TTL), backup CronJob daily, incident response procedure, SealedSecrets for K8s |

### Risk 3: Binance Data Transfer (Cayman Islands)

| Dimension       | Assessment                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Likelihood**  | Low — data is market prices, not personal                                                                                    |
| **Impact**      | Low — no personal data transferred                                                                                           |
| **Severity**    | Negligible                                                                                                                   |
| **Mitigations** | Data transferred is strictly market data (symbols, prices, volumes). No personal identifiers. See third-party DPA assessment |

### Risk 4: Insufficient Audit Trail Retention

| Dimension       | Assessment                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Likelihood**  | Medium — current TTL is 90 days                                                                                                   |
| **Impact**      | Medium — financial regulation may require 5-7 years                                                                               |
| **Severity**    | Requires remediation                                                                                                              |
| **Mitigations** | AUDIT_RETENTION_DAYS configurable. Recommended: extend to 1827 days (5 years) for regulatory compliance (see DPIA action item #1) |

## 4. Data Protection by Design Measures

| Measure                          | Status         | Details                                                |
| -------------------------------- | -------------- | ------------------------------------------------------ |
| ZERO PII architecture            | ✅ Implemented | No collection, storage, or processing of personal data |
| TLS 1.3 mTLS everywhere          | ✅ Implemented | All inter-service communication encrypted              |
| AES-256-GCM encryption at rest   | ✅ Implemented | SPIRE datastore, discovery cache, filesystem fallback          |
| Triple-layer log redaction       | ✅ Implemented | Pino + JSON regex + PEM sanitization                   |
| Append-only audit trail          | ✅ Implemented | MongoDB with correlation IDs + gap detection           |
| Automatic TTL-based retention    | ✅ Implemented | MongoDB indexes (30-90 days), Redis TTL                |
| RBAC service isolation           | ✅ Implemented | K8s ServiceAccounts, Network Policies                  |
| SecureKeyStore memory protection | ✅ Implemented | Zeroed buffers, heap dump protection                   |

## 5. DPIA Action Items

| #   | Action                                                                                               | Priority     | Deadline        |
| --- | ---------------------------------------------------------------------------------------------------- | ------------ | --------------- |
| 1   | Extend audit trail retention from 90 days to 1827 days (5 years) for financial regulatory compliance | 🔴 High      | By next release |
| 2   | Add TTL to MySQL market data tables to prevent unbounded accumulation                                | 🔴 High      | By next release |
| 3   | Configure MongoDB/MySQL encryption at rest                                                           | 🟠 Medium    | Q3 2026         |
| 4   | Document Binance DPA or formal third-party assessment                                                | ✅ Completed | Done            |

## 6. Conclusion

**The trading-model platform does not require prior consultation with a supervisory authority under Art. 36 GDPR**, because:

1. No personal data is processed — the system operates in a pure machine-to-machine domain
2. The residual risks (secret exposure, data transfer) are mitigated by encryption, rotation, and procedural safeguards
3. The DPIA confirms that data protection by design and by default is effectively implemented
4. The identified action items (audit retention, MySQL TTL) are operational improvements, not GDPR compliance gaps

**Overall DPIA status:** Compliant — no personal data processing detected, residual risks managed.
