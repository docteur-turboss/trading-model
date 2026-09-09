# trading-model

Microservices-based AI trading platform. Ingests market data, trains autonomous agents via Genetic Algorithm + Deep Q-Learning, and routes inter-service messages through an internal pub/sub broker.

## Quick Start

```bash
git clone <repo-url> && cd trading-model
npm ci
docker compose up -d
```

mTLS is automatic via SPIRE (ADR-0011) — no manual certificate generation.

See [Quick Start Tutorial](docs/getting-started/quickstart.md) for a 10-minute hands-on walkthrough.

## Architecture

| Layer         | Technology                                                 |
| ------------- | ---------------------------------------------------------- |
| Runtime       | Node.js 26+                                                |
| Language      | TypeScript (ES2020)                                        |
| API           | Express 5                                                  |
| Frontend      | React 19 + Vite + MUI 7                                    |
| Security      | mTLS everywhere (TLS 1.3)                                  |
| Databases     | MongoDB 7, MySQL 8 (Group Replication), Redis 7 (Sentinel) |
| Validation    | Zod                                                        |
| Testing       | Jest + Vitest + Stryker (mutation)                         |
| Observability | Prometheus + Grafana + Jaeger + Loki                       |

### Services

| Service                 | Port | Purpose                                                        |
| ----------------------- | ---- | -------------------------------------------------------------- |
| `discovery-server`      | 8443 | Service registry with TTL-based lease management + HMAC tokens |
| `message-manager`       | 8444 | Topic-based pub/sub broker with DLQ routing                    |
| `financial-scraper`     | 8445 | Binance market data ingestion (candles, trades, order books)   |
| `trader-trainer`        | 8446 | GA + DQN agent evolution engine                                |
| `api-gateway`           | 8448 | Single external entry point: auth, rate-limit, cache, proxy    |
| `admin-interface`       | 8449 | React SPA dashboard (SPA via nginx)                            |
| `audit-logger`          | 8450 | Immutable event traceability + centralized log aggregation     |
| `dlq-service`           | 8452 | Dead letter queue storage with auto-retry + replay             |

### Shared Packages

| Package                             | Purpose                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@trading-model/common`             | HTTP client, logger, middleware, server factories, env validation, circuit breaker, SSRF protection |
| `@trading-model/validation`         | Zod schemas, DTOs, event enums, admin contracts                                                     |
| `@trading-model/server-utils`       | Secure HTTPS server factory, TLS watcher, response protocol                                         |
| `@trading-model/crypto`             | Hashing, signature, and crypto primitives                                                           |
| `@trading-model/address-manager`    | Service discovery client with health-checking and token rotation                                    |
| `@trading-model/broker-message`     | Inter-service messaging SDK with typed event subscriptions                                          |

### Workload identity

- **SPIFFE/SPIRE (ADR-0011):** per-service X.509 SVIDs issued by a SPIRE Server after workload attestation, consumed via `spiffe-helper` sidecars. Replaces the in-house certificate-authority (decommissioned).

## Commands

```bash
npm ci                       # Install all workspace dependencies
npm run build                # Build 6 shared packages in dependency order
npm run build:ts             # Full build (packages + 8 services)
npm run lint                 # Biome check across the monorepo
npm test --workspaces        # All workspace tests
npm run test:coverage        # All tests with coverage
npm run test:contract        # Contract tests
npm run test:e2e             # E2E tests (requires Docker Compose up)
npm run docs:generate        # TypeDoc HTML
npm run commit               # Interactive gitmoji commit CLI
# Release: GitHub Actions → "Release" workflow (version bump + images + GitHub Release + docs)
```

## Deployment

- **Docker Compose:** `docker compose up -d` (all 20+ containers with health-check ordering)
- **Kubernetes:** `kubectl apply -k deploy/k8s/overlays/production` (HPA, PDBs, NetworkPolicies, SealedSecrets)
- **Backup:** Daily CronJob → MongoDB + MySQL + Redis + S3 off-site
- **Secrets:** SealedSecrets (SealedSecret → controller decrypts → standard Secret)
- **Probes:** `startupProbe` (90s window) + `livenessProbe` + `readinessProbe` on all services
- **Identity/mTLS:** SPIRE Server + Agent (K8s PSAT / Docker attestor) issuing SVIDs to `spiffe-helper` sidecars (ADR-0011)

## CI/CD

12+ automated jobs on every push/PR: lint, typecheck, audit, test+coverage, mutation test, K8s validate, container scan, secrets scan, SBOM, contract tests, E2E, load tests.

Pre-push git hook runs: `@biomejs/biome check` → `npm audit` → `build:ts` → `test:coverage`.

## Documentation

- [Documentation Index](docs/README.md) — central entry point to all docs
- [Architecture Standards](docs/standards/architecture-standards.md) — C4 diagrams, dependency graph, service conventions
- [OpenAPI 3.0](docs/services/openapi/api-gateway.yaml) — 18 external-facing endpoints
- [ADR Index](docs/adr/README.md) — 11 architecture decision records
- [Compliance](docs/compliance/) — GDPR register, DPIA, retention policy, breach notification
- [Operations](docs/operations/) — runbooks, SLOs, incident response, diagnostic guide
- [Getting Started](docs/getting-started/quickstart.md) — 10-minute hands-on introduction
- [Examples](examples/) — 5 executable bash scripts for common API workflows

## Security

- **OWASP-hardened:** SSRF protection, anti-noSQL injection, timed-safe token comparison, triple-layer log redaction
- **mTLS everywhere:** SPIFFE/SPIRE workload identity — short-lived X.509 SVIDs with automatic rotation (ADR-0011)
- **Secrets:** SealedSecrets + HMAC-signed service-to-service requests, rotation via `scripts/rotate-secrets.sh`
- **Key zeroing:** SecureKeyStore with buffer zeroing + heap dump protection, AES-256-GCM at rest

## Monitoring

- **Dashboards:** 4 Grafana dashboards (SLO, services, message-manager, trader-trainer)
- **Alerts:** 17 Prometheus rules (6 SLO burn rates + 11 operational) → Alertmanager → Slack/PagerDuty
- **Traces:** OpenTelemetry → OTLP Collector → Jaeger (all 8 services instrumented)
- **Logs:** Pino structured JSON → Promtail → Loki + centralized log aggregation to audit-logger

## Status

**Pre-production — improvements needed before production use.** While the architecture and core services are functional, several areas require hardening before this is ready for production workloads:

- [ ] Full audit of error handling and retry logic across all services
- [ ] Load testing under realistic market conditions
- [ ] Comprehensive disaster recovery validation
- [ ] Security review of all inter-service communication paths
- [ ] Documentation gaps in operations runbooks and incident response
- [ ] End-to-end monitoring and alerting coverage validation
- [ ] Performance benchmarking and resource profiling

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

PolyForm Noncommercial License 1.0.0. See [LICENSE](LICENSE.md).
