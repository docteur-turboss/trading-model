# Access Control Policy

> **Version:** 1.0  
> **Effective:** 2026-06  
> **Review:** Annual  
> **Framework alignment:** ISO/IEC 27001:2022 (A.8, A.9), NIST AC

## 1. Policy Statement

All access to trading-model platform resources shall be authenticated, authorised, and audited. The platform enforces a **zero-trust, service-identity-based access model** where every inter-service call is mutually authenticated via X.509 certificates and authorised via an Access Control List (ACL).

**Principle:** No service is trusted by default. Access is granted on a least-privilege, need-to-communicate basis.

## 2. Access Control Architecture

```
┌──────────────────┐     mTLS (TLS 1.3)     ┌──────────────────┐
│  Calling Service  │ ──────────────────────► │  Target Service  │
│  (certificate in  │   Client cert + ACL     │  (verify +       │
│   request)        │   validation            │   authorise)     │
└──────────────────┘                         └──────────────────┘
```

### 2.1 Authentication Layers

| Layer | Mechanism | Implementation |
|---|---|---|
| **Transport** | mTLS TLS 1.3 | `@trading-model/common/server/create-secure-server.ts` |
| **Identity** | X.509 certificate (SAN/CN) | `@trading-model/common/middleware/mtls-auth.ts` |
| **Bearer token** | HMAC-SHA256 (service registration) | `discovery-server` → `address-manager` |
| **API key** | External admin access | `api-gateway` — `AUTH_TOKENS` env var |

### 2.2 Authorisation Layers

| Layer | Mechanism | Implementation |
|---|---|---|
| **Service-level ACL** | `mtls-authorization.ts` — maps service CN → permitted targets | `@trading-model/common/middleware/mtls-authorization.ts` |
| **Rate limiting** | Per-service rate limits | `express-rate-limit` — configurable per route |
| **Network policy** | K8s NetworkPolicies / Docker Compose network isolation | `deploy/` manifests, `docker-compose.yml` networks |

## 3. Service Identity Management

### 3.1 Certificate-Based Identities

Every service instance is provisioned with an X.509 certificate by the certificate-authority. The certificate Subject Alternative Name (SAN) carries the service identity.

| Identity | Certificate SAN | Issued By | Validity |
|---|---|---|---|
| `discovery-server` | `CN=discovery-server` | CA | 7 days (auto-renewed) |
| `message-manager` | `CN=message-manager` | CA | 7 days (auto-renewed) |
| `financial-scraper` | `CN=financial-scraper` | CA | 7 days (auto-renewed) |
| `trader-trainer` | `CN=trader-trainer` | CA | 7 days (auto-renewed) |
| `certificate-authority` | `CN=certificate-authority` | CA (self-signed root) | 7 days (auto-renewed) |
| `audit-logger` | `CN=audit-logger` | CA | 7 days (auto-renewed) |
| `dlq-service` | `CN=dlq-service` | CA | 7 days (auto-renewed) |
| `api-gateway` | `CN=api-gateway` | CA | 7 days (auto-renewed) |
| `admin-interface` | `CN=admin-interface` | CA | 7 days (auto-renewed) |

**Enforcement:** `@trading-model/common/middleware/mtls-auth.ts` extracts the client identity from the certificate's verified CN/SAN. Requests without a valid certificate are rejected at the TLS handshake level when `ENFORCE_MTLS_STRICT` is enabled.

### 3.2 Service Registration Tokens

Services obtain HMAC-SHA256 tokens from the discovery-server upon registration. These tokens are used for service-to-service identity verification in non-mTLS fallback scenarios.

| Lifecycle Phase | Action | Implementation |
|---|---|---|
| **Registration** | Service registers with discovery-server via mTLS | `address-manager` |
| **Token issuance** | Discovery-server generates HMAC-SHA256 token | `discovery-server` |
| **Token refresh** | Periodic refresh via `address-manager` scheduler | `address-manager` scheduler |
| **Token revocation** | On service deregistration or certificate expiry | `discovery-server` |

## 4. ACL Definition

### 4.1 Default ACL

The default ACL is defined in `@trading-model/common/middleware/mtls-authorization.ts`. It maps each calling service to the set of targets it may call.

```typescript
// Simplified example of the DEFAULT_ACL mapping
const DEFAULT_ACL: Record<string, Set<string>> = {
  'api-gateway':         { 'discovery-server', 'message-manager', 'financial-scraper', 'trader-trainer', 'audit-logger', 'dlq-service', 'certificate-authority', 'admin-interface' },
  'discovery-server':    { 'message-manager', 'certificate-authority' },
  'message-manager':     { 'audit-logger', 'dlq-service' },
  'financial-scraper':   { 'message-manager', 'discovery-server' },
  'trader-trainer':      { 'message-manager', 'discovery-server' },
  'certificate-authority': { 'audit-logger', 'message-manager' },
  'admin-interface':     { 'api-gateway', 'discovery-server', 'certificate-authority', 'message-manager', 'audit-logger' },
  'audit-logger':        {},
  'dlq-service':         { 'message-manager', 'audit-logger' },
};
```

**Enforcement:** Every incoming request passes through `mtls-authorization.ts` middleware. If the caller's identity is not found in the target service's authorised callers, the request is rejected with HTTP 403.

### 4.2 ACL Change Procedure

1. Submit PR modifying the `DEFAULT_ACL` mapping in `mtls-authorization.ts`
2. PR must be reviewed by Platform Security Lead
3. Deploy updated package to all services
4. Rollback available via git revert

## 5. Privileged Access

### 5.1 Administrator Access

| Resource | Access Method | Authentication | Authorisation |
|---|---|---|---|
| admin-interface SPA | HTTPS via browser | mTLS client certificate | CN-based ACL |
| API gateway admin endpoints | HTTPS + API key | `x-api-key` header | `AUTH_TOKENS` env var |
| Database (MongoDB) | mTLS connection | Client certificate | Service account RBAC |
| Database (MySQL) | TLS connection | Username/password + SealedSecret | SQL grants |
| Kubernetes API | kubectl + client cert | mTLS certificate | RBAC roles + SealedSecrets |

### 5.2 Emergency Access (Break-Glass)

In the event of certificate-authority unavailability:

1. Use `scripts/generate-certs.sh` to generate temporary self-signed certificates
2. Document the override in the audit-logger with reason and timestamp
3. Revoke temporary certificates within 24 hours
4. Initiate incident response procedure

## 6. Access Review

| Review Type | Frequency | Scope |
|---|---|---|
| ACL audit | Annual | Verify service-to-service ACL mappings match current architecture |
| Certificate audit | Continuous | All certificates auto-renewed every 7 days; expired certs rejected |
| Token audit | Annual | Verify HMAC token rotation and revocation procedures |
| Emergency access log review | Quarterly | Review break-glass incidents for compliance |

## 7. Enforcement & Violations

| Violation | Consequence |
|---|---|
| Unauthenticated request to internal service | TLS handshake rejected (connection refused) |
| Unauthorised service-to-service call | HTTP 403 Forbidden (logged with correlation ID) |
| Expired certificate usage | TLS handshake rejected (certificate validation error) |
| ACL bypass attempt | Security incident — escalated per [Incident Response Policy](incident-response-policy.md) |

## 8. Cross-References

| Document | Relevance |
|---|---|
| [Information Security Policy](information-security-policy.md) §5 | Access control framework |
| `@trading-model/common/middleware/mtls-auth.ts` | mTLS authentication implementation |
| `@trading-model/common/middleware/mtls-authorization.ts` | ACL authorization implementation |
| `@trading-model/certificate-client` | Certificate provisioning and renewal |
| [Incident Response Policy](incident-response-policy.md) | Security incident escalation |
