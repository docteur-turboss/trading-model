# Information Security Policy

> **Version:** 1.0  
> **Effective:** 2026-06  
> **Owner:** Platform Security Lead  
> **Review:** Annual  
> **Framework alignment:** ISO/IEC 27001:2022, NIST CSF

## 1. Policy Statement

The trading-model platform processes machine-generated financial market data and operates a zero-personal-data architecture. This Information Security Policy defines the principles, controls, and responsibilities for protecting the confidentiality, integrity, and availability of all platform assets.

**Scope:** All 9 microservices, 5 shared packages, infrastructure (Docker, Kubernetes, databases), CI/CD pipelines, and supporting observability stack.

## 2. Information Security Objectives

| Objective | Metric | Target |
|---|---|---|
| Prevent unauthorised access to platform services | mTLS authentication coverage | 100% of inter-service communication |
| Ensure data integrity in transit and at rest | Encryption coverage | 100% (TLS 1.3 + AES-256-GCM) |
| Maintain service availability | Uptime per service | ≥ 99.9% (production target) |
| Detect and respond to security incidents | Time to detect (TTD) | ≤ 15 minutes |
| Ensure secure software development lifecycle | Critical/high vulnerabilities in production | 0 |
| Maintain immutable audit trail | Audit event capture rate | 100% of inter-service messages |

## 3. Organisation of Information Security

### 3.1 Roles & Responsibilities

| Role | Responsibility |
|---|---|
| **Platform Security Lead** | Policy ownership, risk assessment, incident coordination |
| **DevOps Engineers** | Infrastructure security, certificate lifecycle, access management |
| **Software Engineers** | Secure coding, dependency management, vulnerability remediation |
| **All Personnel** | Report security incidents, follow secure practices |

### 3.2 Segregation of Duties

- mTLS certificate issuance (certificate-authority) is separate from certificate consumption (certificate-client)
- Audit logging (audit-logger) is separate from message routing (message-manager)
- CI/CD pipeline secrets are managed via SealedSecrets, not exposed to developers

## 4. Asset Management

### 4.1 Asset Classification

| Classification | Definition | Examples |
|---|---|---|
| **Critical** | Compromise would severely impact platform operations | CA private keys, HMAC master secrets, database credentials |
| **High** | Compromise would impact service availability or data integrity | Service certificates, Redis Stream data, MongoDB audit logs |
| **Medium** | Compromise would cause limited operational impact | Market data (candles, trades, tickers), training checkpoints |
| **Low** | Compromise has negligible impact | Public documentation, TypeDoc output, example configurations |

### 4.2 Asset Inventory

All platform assets are documented in:
- `docker-compose.yml` — container definitions
- `deploy/` — Kubernetes manifests
- `docs/deployment/ENV.md` — environment variables and secrets
- `docs/architecture/api/` — service API documentation

## 5. Access Control

### 5.1 Network Access Control

- **mTLS mandatory:** All inter-service communication requires mutual TLS 1.3 with X.509 certificates issued by the internal certificate-authority
- **Service identity:** Extracted from certificate SAN/CN via `@trading-model/common/middleware/mtls-auth.ts`
- **Authorization:** ACL-based service-to-service access control via `@trading-model/common/middleware/mtls-authorization.ts`

### 5.2 Authentication Methods

| Method | Used For | Implementation |
|---|---|---|
| mTLS certificates | Service-to-service | `@trading-model/certificate-client` auto-provisioning |
| HMAC-SHA256 tokens | Service registration | `discovery-server` token generation + `address-manager` lifecycle |
| API keys | External admin access | `AUTH_TOKENS` env var in `api-gateway` |
| OIDC | Certificate request authentication | `certificate-authority` OidcVerifier |

## 6. Cryptography

### 6.1 Encryption Standards

| Use Case | Algorithm | Key Length | Standard |
|---|---|---|---|
| Transport security | TLS 1.3 (mTLS) | EC P-384 / RSA 2048+ | NIST SP 800-52 Rev. 2 |
| Data at rest (CA keys) | AES-256-GCM | 256-bit | NIST SP 800-38D |
| Certificate signing | RSA / EC P-384 | 4096-bit (RSA) / 384-bit (EC) | NIST SP 800-186 |
| Message integrity | HMAC-SHA256 | 256-bit | FIPS 180-4 |
| Secure random generation | CSPRNG | — | NIST SP 800-90A |

### 6.2 Key Management

| Key Type | Storage | Rotation | Access |
|---|---|---|---|
| CA root keys | AES-256 encrypted filesystem | 3-version retention, manual rotation | certificate-authority only |
| Service certificates | In-memory (SecureKeyStore) | Auto-renewal every 7 days | Consuming service only |
| HMAC tokens | Address-manager cache | Refresh cycle via scheduler | Registered service only |
| Database credentials | K8s SealedSecrets | Manual rotation via `scripts/rotate-secrets.sh` | Service accounts via RBAC |

## 7. Physical & Environmental Security

The platform is deployed as a containerised microservice architecture. Physical security is the responsibility of the hosting provider (cloud / bare-metal). The platform ensures:

- No sensitive data written to persistent host volumes (except AES-256 encrypted CA keys)
- All database data encrypted at rest via storage-layer encryption
- Secrets never exposed in environment variables in plaintext (SealedSecrets)

## 8. Operations Security

### 8.1 Logging & Monitoring

| Component | Tool | Retention |
|---|---|---|
| Structured application logs | Pino → stdout → Promtail → Loki | 30 days |
| Audit events | MongoDB (audit-logger) | 90 days → target 5 years |
| Service metrics | Prometheus → Grafana | 15 days |
| Distributed traces | OpenTelemetry → Jaeger | 7 days |
| Certificate lifecycle events | certificate-authority audit store | 90 days |

### 8.2 Log Redaction

All logs pass through three layers of sensitive data redaction before persistence:

1. **Pino redact paths** — 16+ patterns for known sensitive fields
2. **JSON stringifier regex** — 15+ patterns for credential-like strings
3. **PEM sanitizer** — Strips certificate private keys from log output

Implementation: `@trading-model/common/config/logger.ts`

## 9. Communications Security

| Requirement | Implementation |
|---|---|
| **Network segmentation** | Docker Compose networks (frontend, backend, db, monitoring). K8s Network Policies |
| **mTLS enforcement** | TLS 1.3 mandatory. `ENFORCE_MTLS_STRICT` feature flag enables mutual authentication |
| **Service mesh** | Not deployed; mTLS handled at application layer via Express middleware |
| **API gateway isolation** | External traffic enters only through api-gateway (port 8448). All other ports are internal |

## 10. Software Development Security

### 10.1 Secure Development Lifecycle

| Phase | Controls |
|---|---|
| **Design** | Architecture Decision Records (ADRs), threat modelling |
| **Implementation** | Biome linting, TypeScript strict mode, no `any` types |
| **Testing** | Unit tests (100% coverage threshold for most packages), contract tests, E2E tests |
| **Review** | PR review required, commitlint enforces semantic commits |
| **Audit** | `npm audit` in CI, dependency scanning, secrets scanning (truffleHog) |
| **Deployment** | Container image signing, SBOM generation, multi-stage Docker builds |

### 10.2 Dependency Management

- `npm ci` for reproducible builds
- Automated dependency updates via CI (audit job)
- Lockfile maintained in version control

## 11. Incident Response

See [Incident Response Policy](incident-response-policy.md) for detailed procedures.

**Key principles:**
- Report all security incidents immediately to the Platform Security Lead
- Document every incident with correlation ID via audit-logger
- Apply forensic containment (scale to zero / isolate service) before root cause analysis
- Regulatory notification within 24 hours for reportable incidents (financial regulations)

## 12. Business Continuity

See [Business Continuity Policy](business-continuity-policy.md) for detailed BCP/DR procedures.

## 13. Compliance

The platform is designed to comply with:
- **GDPR** — Zero personal data architecture (see [DPIA](dpia.md))
- **MiFID II** — Record-keeping Art. 72 (see [Algorithmic Trading Compliance](algorithmic-trading-compliance.md))
- **MAR** — Market abuse prevention Art. 16
- **DORA** — Digital operational resilience (see [Compliance Framework](compliance-framework.md))

## 14. Policy Review & Enforcement

- This policy is reviewed annually or after any significant security incident
- Compliance is enforced through CI/CD gates (pre-push hooks, automated security scanning)
- Violations are documented and remediated via the incident response process

---

## Appendix A: Control Mapping (ISO 27001:2022)

| ISO Control | Title | Platform Implementation |
|---|---|---|
| **5.1** | Information security policy | This document |
| **5.2** | Information security roles and responsibilities | Section 3 |
| **5.9** | Inventory of information and other associated assets | Section 4.2 |
| **6.8** | Information security event reporting | Section 11 + audit-logger |
| **8.1** | User endpoint devices | Not applicable — no user endpoints |
| **8.2** | Privileged access rights | mTLS + ACL middleware |
| **8.5** | Secure authentication | mTLS, HMAC, OIDC (Section 5.2) |
| **8.8** | Management of technical vulnerabilities | CI dependency scanning, annual review |
| **8.9** | Configuration management | Infrastructure as Code (Docker + K8s) |
| **8.10** | Information deletion | TTL-based retention (see data retention policy) |
| **8.11** | Data masking | Log redaction (Section 8.2) |
| **8.12** | Prevention of data leakage | Network Policies, mTLS isolation |
| **8.15** | Logging | Audit-logger, structured logging (Section 8.1) |
| **8.16** | Monitoring activities | Prometheus + Grafana |
| **8.24** | Use of cryptography | Section 6 |
| **8.25** | Secure development lifecycle | Section 10.1 |
| **8.29** | Security testing in development and acceptance | CI test suite, contract tests |
| **8.30** | Outsourced development | No outsourced development |
