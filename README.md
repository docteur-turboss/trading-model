# trading-model

Microservices-based AI trading platform. Ingests market data, trains autonomous agents via Genetic Algorithm + Deep Q-Learning, and routes inter-service messages through an internal pub/sub broker.

## Quick Start

```bash
git clone <repo-url> && cd trading-model
npm ci
bash scripts/generate-certs.sh
docker compose up -d
```

See [Quick Start Tutorial](docs/tutorials/QUICKSTART.md) for a 10-minute hands-on walkthrough.

## Architecture

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22+ |
| Language | TypeScript (ES2022) |
| API | Express 5 |
| Frontend | React 19 + Vite + MUI 7 |
| Security | mTLS everywhere (TLS 1.3) |
| Databases | MongoDB 7, MySQL 8 (Group Replication), Redis 7 (Sentinel) |
| Validation | Zod |
| Testing | Jest + Vitest + Stryker (mutation) |
| Observability | Prometheus + Grafana + Jaeger + Loki |

### Services

| Service | Port | Purpose |
|---------|------|---------|
| `discovery-server` | 8443 | Service registry with TTL-based lease management + HMAC tokens |
| `message-manager` | 8444 | Topic-based pub/sub broker with DLQ routing |
| `financial-scraper` | 8445 | Binance market data ingestion (candles, trades, order books) |
| `trader-trainer` | 8446 | GA + DQN agent evolution engine |
| `certificate-authority` | 8447 | X.509 certificate lifecycle: signing, rotation, CRL |
| `api-gateway` | 8448 | Single external entry point: auth, rate-limit, cache, proxy |
| `admin-interface` | 8449 | React SPA dashboard (SPA via nginx) |
| `audit-logger` | 8450 | Immutable event traceability + centralized log aggregation |
| `dlq-service` | 8452 | Dead letter queue storage with auto-retry + replay |

### Shared Packages

| Package | Purpose |
|---------|---------|
| `@trading-model/common` | HTTP client, logger, middleware, server factories, env validation, circuit breaker, SSRF protection |
| `@trading-model/address-manager` | Service discovery client with health-checking and token rotation |
| `@trading-model/broker-message` | Inter-service messaging SDK with typed event subscriptions |
| `@trading-model/certificate-utils` | X.509 certificate generation, signing, validation, CRL management |
| `@trading-model/certificate-client` | Automatic mTLS certificate provisioning and renewal |

## Commands

```bash
npm ci                       # Install all workspace dependencies
npm run build                # Build 4 shared packages in dependency order
npm run build:ts             # Full build (packages + 9 services)
npm run lint                 # ESLint across the monorepo
npm test --workspaces        # All workspace tests
npm run test:coverage        # All tests with coverage
npm run test:contract        # Contract tests
npm run test:e2e             # E2E tests (requires Docker Compose up)
npm run docs:generate        # TypeDoc HTML
npm run commit               # Interactive gitmoji commit CLI
npm run release              # Version bump + changelog + tag + push
```

## Deployment

- **Docker Compose:** `docker compose up -d` (all 20+ containers with health-check ordering)
- **Kubernetes:** `kubectl apply -k deploy/k8s/overlays/production` (HPA, PDBs, NetworkPolicies, SealedSecrets)
- **Backup:** Daily CronJob → MongoDB + MySQL + Redis + CA keys + S3 off-site
- **Secrets:** SealedSecrets (SealedSecret → controller decrypts → standard Secret)
- **Probes:** `startupProbe` (90s window) + `livenessProbe` + `readinessProbe` on all services

## CI/CD

12+ automated jobs on every push/PR: lint, typecheck, audit, test+coverage, mutation test, K8s validate, container scan, secrets scan, SBOM, contract tests, E2E, load tests.

Pre-push git hook runs: `prettier` → `eslint` → `npm audit` → `build:ts` → `test:coverage`.

## Documentation

- [Documentation Index](docs/README.md) — 84 markdown files across 4 sections
- [Architecture Standards](docs/standards/ARCHITECTURE.md) — C4 diagrams, dependency graph, service conventions
- [OpenAPI 3.0](docs/architecture/api/openapi/api-gateway.yaml) — 18 external-facing endpoints
- [ADR Index](docs/adr/README.md) — 9 architecture decision records
- [Compliance](docs/compliance/) — GDPR register, DPIA, retention policy, breach notification
- [Operations](docs/operations/) — 9 runbooks + diagnostic guide + incident response
- [Tutorials](docs/tutorials/QUICKSTART.md) — 10-minute hands-on introduction
- [Examples](examples/) — 5 executable bash scripts for common API workflows

## Security

- **OWASP-hardened:** SSRF protection, anti-noSQL injection, timed-safe token comparison, triple-layer log redaction
- **mTLS everywhere:** certificate-authority manages full X.509 lifecycle with automatic rotation
- **Secrets:** SealedSecrets + Vault Transit for CA key signing, git-secret-cleanup script
- **Key zeroing:** SecureKeyStore with buffer zeroing + heap dump protection, AES-256-GCM at rest

## Monitoring

- **Dashboards:** 4 Grafana dashboards (SLO, services, message-manager, trader-trainer)
- **Alerts:** 17 Prometheus rules (6 SLO burn rates + 11 operational) → Alertmanager → Slack/PagerDuty
- **Traces:** OpenTelemetry → OTLP Collector → Jaeger (8/9 services instrumented)
- **Logs:** Pino structured JSON → Promtail → Loki + centralized log aggregation to audit-logger

## Status

**Production-ready with ongoing improvements.** Audited across 19 dimensions:
- Architecture, Backup/DR, CI/CD, Clean Architecture, Code Smells, Compliance, Concurrency, Documentation, Error Handling, Operations, Performance, Security (OWASP), SOLID, Testing.

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

PolyForm Noncommercial License 1.0.0. See [LICENSE](LICENSE.md).
