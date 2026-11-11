# Access Control Policy

> **Version:** 1.0  
> **Effective:** 2026-06  
> **Review:** Annual  
> **Framework alignment:** ISO/IEC 27001:2022 (A.8, A.9), NIST AC

## 1. Policy Statement

All access to trading-model platform resources shall be authenticated, authorised, and audited. The platform enforces a **zero-trust, service-identity-based access model** where every inter-service call is mutually authenticated via X.509 SVIDs (SPIFFE/SPIRE, ADR-0011) and authorised via an Access Control List (ACL).

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
| **Transport** | mTLS TLS 1.3 | `@trading-model/server-utils/adapters/inbound/create-secure-server.ts` |
| **Identity** | SPIFFE ID (SAN `spiffe://...`) | `@trading-model/http/adapters/inbound/mtls-auth.ts` |
| **Bearer token** | HMAC-SHA256 (service registration) | `discovery-server` → `address-manager` |
| **API key** | External access, one named key per client with its scopes (`read`, `dlq:write`; ADR-0059) | `api-gateway` — `AUTH_TOKENS` env var (`name:scopes:secret`) |

### 2.2 Authorisation Layers

| Layer | Mechanism | Implementation |
|---|---|---|
| **Service-level ACL** | `mtls-authorization.ts` — maps caller SPIFFE ID → permitted targets | `@trading-model/http/adapters/inbound/mtls-authorization.ts` |
| **Rate limiting** | Per-service rate limits | `express-rate-limit` — configurable per route |
| **Network policy** | K8s NetworkPolicies / Docker Compose network isolation | `deploy/` manifests, `docker-compose.yml` networks |

## 3. Service Identity Management

### 3.1 SPIFFE-Based Identities

Every service instance is provisioned with an X.509 SVID issued by the SPIRE Server after workload attestation. The SVID Subject Alternative Name (SAN) carries the SPIFFE ID `spiffe://trading-model.local/ns/<namespace>/sa/<service>`.

| Identity | SPIFFE ID (SAN) | Issued By | Validity |
|---|---|---|
| `discovery-server` | `spiffe://trading-model.local/ns/trading-model/sa/discovery-server` | SPIRE Server | 1h TTL (auto-rotated) |
| `message-manager` | `spiffe://trading-model.local/ns/trading-model/sa/message-manager` | SPIRE Server | 1h TTL (auto-rotated) |
| `financial-scraper` | `spiffe://trading-model.local/ns/trading-model/sa/financial-scraper` | SPIRE Server | 1h TTL (auto-rotated) |
| `trader-trainer` | `spiffe://trading-model.local/ns/trading-model/sa/trader-trainer` | SPIRE Server | 1h TTL (auto-rotated) |
| `audit-logger` | `spiffe://trading-model.local/ns/trading-model/sa/audit-logger` | SPIRE Server | 1h TTL (auto-rotated) |
| `dlq-service` | `spiffe://trading-model.local/ns/trading-model/sa/dlq-service` | SPIRE Server | 1h TTL (auto-rotated) |
| `api-gateway` | `spiffe://trading-model.local/ns/trading-model/sa/api-gateway` | SPIRE Server | 1h TTL (auto-rotated) |
| `edge-proxy` | `spiffe://trading-model.local/ns/trading-model/sa/edge-proxy` | SPIRE Server | 1h TTL (auto-rotated) |

**Enforcement:** `@trading-model/http/adapters/inbound/mtls-auth.ts` extracts the client identity from the SVID's verified SPIFFE ID SAN. Requests without a valid SVID are rejected at the TLS handshake level (all environments). When `ENFORCE_MTLS_STRICT` is enabled (production), `mtls-authorization.ts` additionally enforces the ACL on every inbound request.

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

The default ACL is defined in `@trading-model/http/adapters/inbound/mtls-authorization.ts`. It maps each target service to the set of callers allowed to reach it (`"*"` = any platform service).

```typescript
// Simplified example of the DEFAULT_ACL mapping
const DEFAULT_ACL: Record<KnownService, readonly ServiceId[]> = {
  'discovery-server':   [ '*' ],
  'audit-logger':       [ '*' ],
  'message-manager':    [ 'discovery-server', 'financial-scraper', 'trader-trainer', 'audit-logger', 'dlq-service' ],
  'financial-scraper':  [ 'api-gateway', 'message-manager', 'trader-trainer' ],   // trader-trainer: reads the data supply (ADR-0036)
  'trader-trainer':     [ 'api-gateway', 'financial-scraper', 'discovery-server', 'message-manager' ],
  'api-gateway':        [ 'edge-proxy' ],   // external entry point (ADR-0018)
  'dlq-service':        [ '*' ],
};
```

**Enforcement:** When `ENFORCE_MTLS_STRICT` is enabled, every incoming request passes through `mtls-authorization.ts` middleware. If the caller's identity is not found in the target service's authorised callers, the request is rejected with HTTP 403.

### 4.2 ACL Change Procedure

1. Submit PR modifying the `DEFAULT_ACL` mapping in `mtls-authorization.ts`
2. PR must be reviewed by Platform Security Lead
3. Deploy updated package to all services
4. Rollback available via git revert

## 5. Privileged Access

### 5.1 Administrator Access

| Resource | Access Method | Authentication | Authorisation |
|---|---|---|
| API gateway admin endpoints (DLQ delete, replay, store) | HTTPS + API key | `x-api-key` header | scope `dlq:write` of the key in `AUTH_TOKENS` (403 without it); the key name is recorded as `actor` of the DLQ audit events (ADR-0059) |
| Database (MongoDB) | Plain TCP in the cluster (no TLS, ADR-0060); operators through `kubectl exec` | None until issue #669 ships MongoDB authentication | NetworkPolicy: port 27017 only from the owner service, the replica set members and the init Job ([databases.md](../architecture/databases.md#mongodb--message-manager-and-audit)); `kubectl exec` through Kubernetes RBAC |
| Database (MySQL) | Plain TCP in the cluster (no TLS, ADR-0060); the replication user alone requires SSL | Username/password + SealedSecret | NetworkPolicy: ports 3306 / 33061 only from the listed client components ([databases.md](../architecture/databases.md)); SQL grants |
| Grafana (metrics, Loki logs) | HTTPS through the ingress | OIDC, one account per person (ADR-0063); local `admin` kept for break-glass only | Role `Viewer` by default, no sign-up, no anonymous access; Admin granted by hand |
| Kubernetes API | kubectl + client cert | mTLS certificate | RBAC roles + SealedSecrets |

### 5.2 Emergency Access (Break-Glass)

In the event of SPIRE unavailability:

1. Restart the `spire-server` / `spire-agent` stack and let the `spire-entries` sidecar of the server pod reconcile the entries to re-issue SVIDs
2. Document the override in the audit-logger with reason and timestamp
3. Rotate SVIDs once SPIRE is stable
4. Initiate incident response procedure

### 5.3 Grafana Break-Glass

The shared `admin` account (`GRAFANA_PASSWORD`) is used only when the identity provider is down: see [ADR-0063](../adr/0063-grafana-per-person-access-through-oidc.md) and the [runbook](../operations/runbooks/runbook-grafana-break-glass.md). Each use is written in the incident log (who, why, when); rotate `GRAFANA_PASSWORD` afterwards.

## 6. Access Review

| Review Type | Frequency | Scope |
|---|---|---|
| ACL audit | Annual | Verify service-to-service ACL mappings match current architecture |
| SVID audit | Continuous | All SVIDs auto-rotated (1h TTL); expired SVIDs rejected |
| Token audit | Annual | Verify HMAC token rotation and revocation procedures |
| Emergency access log review | Quarterly | Review break-glass incidents for compliance |
| Grafana account review | Quarterly | List Grafana users (Administration > Users): remove leavers, keep Admin to named operators, check `GRAFANA_PASSWORD` was rotated after any break-glass use. Logins are in Loki (logger `context`) |
| API key review | Quarterly | List the names and scopes of `AUTH_TOKENS`: remove keys nobody owns, keep `dlq:write` to operators who purge or replay the DLQ, rewrite old-format keys (bare secret, ADR-0059) |

## 7. Enforcement & Violations

| Violation | Consequence |
|---|---|
| Unauthenticated request to internal service | TLS handshake rejected (connection refused) |
| Unauthorised service-to-service call | HTTP 403 Forbidden (logged with correlation ID) |
| Expired SVID usage | TLS handshake rejected (certificate validation error) |
| ACL bypass attempt | Security incident — escalated per [Incident Response Policy](incident-response-policy.md) |

## 8. Cross-References

| Document | Relevance |
|---|---|
| [Information Security Policy](information-security-policy.md) §5 | Access control framework |
| `@trading-model/http/adapters/inbound/mtls-auth.ts` | mTLS authentication implementation |
| `@trading-model/http/adapters/inbound/mtls-authorization.ts` | ACL authorization implementation |
| `spiffe-helper` sidecar + SPIRE Workload API | SVID provisioning and rotation (ADR-0011) |
| [Incident Response Policy](incident-response-policy.md) | Security incident escalation |
