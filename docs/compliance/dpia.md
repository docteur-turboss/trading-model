# Data Protection Impact Assessment (DPIA)

> **Performed:** 2026-06 (revised 2026-10 after audit 13.09)  
> **Assessment scope:** trading-model platform (all 7 services, 12 packages)  
> **Methodology:** CNIL PIA framework (Art. 35 GDPR)

## 1. System Overview

The trading-model platform is a microservices-based algorithmic trading research infrastructure. It ingests market data from Binance, trains machine learning trading agents via genetic algorithms and deep Q-learning, and routes inter-service messages through an internal message bus. It has no user accounts and no authentication for individuals; its only personal data is the truncated IP of external API callers in the edge-proxy access logs (31 days).

**Key characteristics:**

- 7 backend microservices (Node.js/TypeScript/Express)
- Event-driven architecture (message-manager: HTTP push broker, durable Redis Streams journal 24 h, ADR-0048)
- mTLS via SPIFFE/SPIRE workload identity (ADR-0011)
- Self-hosted databases (MongoDB, MySQL, Redis)

## 2. Necessity and Proportionality Assessment

| Question                                  | Answer | Justification                                                                                                                                                     |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is personal data collected?               | **Minimal** | Only the caller IP of the public API, truncated by the edge-proxy (IPv4 /24, IPv6 /48) before it is logged or forwarded, kept 31 days in Loki (register activity 6). All other data is machine-generated. No names, emails or device IDs |
| Could the system function with less data? | N/A    | The system already operates with the minimum data necessary: trading symbols + numeric market data                                                                |
| Are data subjects informed?               | Partly | API callers are operators of the platform; the access-log processing is documented in the register (activity 6) |
| Is consent required?                      | **No** | Art. 6(1)(f) — legitimate interest applies. No human interaction occurs                                                                                           |
| Is profiling performed?                   | **No** | The system makes no decisions about individuals. ML agents make trading decisions on synthetic/market data                                                        |

## 3. Risk Analysis

### Risk 1: Accidental Introduction of Personal Data

| Dimension       | Assessment                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Likelihood**  | Low — no user creation endpoints exist. Only service-to-service communication                                                                                                                                             |
| **Impact**      | Medium — if PII accidentally entered via log messages or payloads                                                                                                                                                         |
| **Severity**    | Acceptable                                                                                                                                                                                                                |
| **Mitigations** | Ingress controller access log disabled (K8s prerequisite, no full IP/User-Agent/Referer on the node); edge-proxy reads the real caller IP from the controller's `X-Forwarded-For`. Edge-proxy access log truncates the caller IP and omits query string, User-Agent and X-Forwarded-For; the gateway drops `X-Real-IP`. Log redaction by `sensitive-data-sanitizer.ts` (11 sensitive-key patterns including IP/network keys, PEM stripping). Payload sanitizer anti-injection. IP addresses are anonymized at source before logging. If PII is ever introduced, this redaction applies before persistence |

### Risk 2: Secret Key Exposure

| Dimension       | Assessment                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Likelihood**  | Low — mTLS between services, SecureKeyStore, AES-256-GCM at rest, automountServiceAccountToken: false                   |
| **Impact**      | High — compromise of SPIRE CA keys / SVIDs or service tokens could disrupt platform security                                    |
| **Severity**    | Tolerable (not PII-related)                                                                                       |
| **Mitigations** | Automatic SVID rotation (4h TTL), backup CronJob daily, incident response procedure, SealedSecrets for K8s |

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
| **Likelihood**  | Low — current TTL is 1827 days (5 years)                                                                                          |
| **Impact**      | Low — financial regulation requires 5 years, currently met                                                                        |
| **Severity**    | Acceptable                                                                                                                        |
| **Mitigations** | AUDIT_RETENTION_DAYS defaults to 1827 days (5 years) in code. TTL index auto-expires documents. See action item #1 (completed)   |

## 4. Data Protection by Design Measures

| Measure                          | Status         | Details                                                |
| -------------------------------- | -------------- | ------------------------------------------------------ |
| Minimal PII architecture         | ✅ Implemented | No accounts or profiles. Caller IPs truncated by the edge-proxy before logging and forwarding; application logs truncate IPs; context fields sanitized before MongoDB persistence |
| TLS 1.3 mTLS between services    | ⚠️ Partial     | Service-to-service HTTP only. Database client traffic to MongoDB and Redis is plain TCP in the cluster; NetworkPolicies and per-service credentials protect it, residual risk accepted in ADR-0060, TLS planned (#930, #769); MySQL is TLS with client certificates and `require` (#767) |
| AES-256-GCM encryption at rest   | ✅ Implemented | SPIRE datastore, discovery cache, filesystem fallback          |
| Storage & backup encryption      | ✅ Implemented | LUKS2 data disks unlocked by Clevis/Tang (`deploy/host/`); every backup age-encrypted before it is written or copied off-site |
| Log redaction                    | ✅ Implemented | `sensitive-data-sanitizer.ts`: 11 sensitive-key patterns (credentials, IP keys) redacted to `[REDACTED]`, plus PEM blocks stripped by `sanitizeForLog`, before persistence |
| Append-only audit trail          | ✅ Implemented | MongoDB with correlation IDs + gap detection           |
| Automatic TTL-based retention    | ⚠️ Partial     | MongoDB TTL indexes (1827 days audit, 30 days DLQ), Loki 31 days, Prometheus 30 days, backups 30 days. MySQL market data 1827 days via `db-retention` (action #2, ADR-0051), message journal 24 h |
| RBAC service isolation           | ✅ Implemented | K8s ServiceAccounts, Network Policies                  |
| SecureKeyStore memory protection | ✅ Implemented | Zeroed buffers, heap dump protection                   |

## 5. DPIA Action Items

| #   | Action                                                                                               | Priority     | Deadline        |
| --- | ---------------------------------------------------------------------------------------------------- | ------------ | --------------- |
| 1   | ~~Extend audit trail retention from 90 days to 1827 days (5 years)~~ | ✅ Completed | Done (env.ts default: 1827) |
| 2   | Bound MySQL market data (CronJob `db-retention`, 1827 days, ADR-0051)                                | ✅ Done      | Done 2026-11 |
| 3   | ~~Configure MongoDB/MySQL encryption at rest~~ (storage layer: LUKS2 + Clevis/Tang data disks, age-encrypted backups, [Encryption at Rest](../deployment/ENCRYPTION_AT_REST.md)) | ✅ Completed | Done |
| 4   | Document Binance DPA or formal third-party assessment                                                | ✅ Completed | Done            |

## 6. Conclusion

**The trading-model platform does not require prior consultation with a supervisory authority under Art. 36 GDPR**, because:

1. The only personal data is a truncated caller IP kept 31 days for security — no large-scale processing, no profiling, no special categories
2. The residual risks (secret exposure, data transfer) are mitigated by encryption, rotation, and procedural safeguards
3. The DPIA confirms that data protection by design and by default is effectively implemented
4. The identified action items (audit retention, MySQL retention: done, ADR-0051) are operational improvements, not GDPR compliance gaps

**Overall DPIA status:** Compliant — personal data limited to truncated caller IPs (31 days).
