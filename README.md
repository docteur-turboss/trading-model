# trading-model

Microservices-based AI trading platform. Ingests market data, trains autonomous agents via Genetic Algorithm + Deep Q-Learning, and routes inter-service messages through an internal pub/sub broker.

## Quick Start

```bash
git clone <repo-url> && cd trading-model
bun install --frozen-lockfile
cp .env.example .env   # then replace the example values, see below
docker compose up -d
```

Before the first `docker compose up`, set these variables in `.env` and replace their example values with your own secrets (`openssl rand -hex 32`):

- `MYSQL_ROOT_PASSWORD` — MySQL root password
- `GATEWAY_AUTH_TOKENS` — gateway API keys (`x-api-key`), comma-separated
- `SIGNING_SECRET` — HMAC secret of the discovery instance tokens

The Compose stack runs with `NODE_ENV=production` by default: without these values the gateway and discovery-server refuse to start.

> **Development only.** The Docker Compose stack has no scheduled backup: do not store real data in it. See [SETUP.md](docs/deployment/SETUP.md#local-development-setup).

mTLS is automatic via SPIRE (ADR-0011) — no manual certificate generation.

See [Quick Start Tutorial](docs/getting-started/quickstart.md) for a 10-minute hands-on walkthrough.

## Architecture

| Layer         | Technology                                                 |
| ------------- | ---------------------------------------------------------- |
| Runtime       | Bun 1.x (Node.js 26-compatible APIs)                       |
| Language      | TypeScript (ES2020)                                        |
| API           | Express 5                                                  |
| Frontend      | None for now — removed, see ADR-0018                       |
| Security      | mTLS everywhere (TLS 1.3)                                  |
| Databases     | MongoDB 7, MySQL 8 (Group Replication), Redis 7 (Sentinel) |
| Validation    | Zod                                                        |
| Testing       | Jest + Stryker (mutation)                                  |
| Observability | Prometheus + Grafana + Jaeger + Loki                       |

### Services

| Service                 | Port | Purpose                                                        |
| ----------------------- | ---- | -------------------------------------------------------------- |
| `discovery-server`      | 8443 | Service registry with TTL-based lease management + HMAC tokens |
| `message-manager`       | 8444 | Topic-based pub/sub broker with DLQ routing                    |
| `financial-scraper`     | 8445 | Binance market data ingestion (candles, trades, order books)   |
| `trader-trainer`        | 8446 | GA + DQN agent evolution engine                                |
| `api-gateway`           | 8448 | Single external entry point: auth, rate-limit, cache, proxy    |
| `audit-logger`          | 8450 | Immutable event traceability + centralized log aggregation     |
| `dlq-service`           | 8452 | Dead letter queue storage with auto-retry + replay             |
| `edge-proxy`            | 8449 | nginx: external HTTP entry, `/v1` → api-gateway over mTLS      |

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
bun install --frozen-lockfile                       # Install all workspace dependencies
bun run build                # Build the shared packages in dependency order
bun run build:ts             # Full build (packages + 7 services)
bun run lint                 # Biome check across the monorepo
bun run test        # All workspace tests
bun run test:coverage        # All tests with coverage
bun run test:contract        # Cross-service contracts (real producer/client code → real consumer/server code)
bun run api:check            # OpenAPI and documented routes vs the real routes
bun run test:e2e             # E2E tests (requires Docker Compose up)
bun run docs:generate        # TypeDoc HTML
bun run commit               # Interactive gitmoji commit CLI
# Release: GitHub Actions → "Release" workflow (version bump + images + GitHub Release + docs)
```

## Deployment

- **Docker Compose:** `docker compose up -d` (all 20+ containers with health-check ordering)
- **Kubernetes:** `kubectl apply -k deploy/k8s/overlays/production` (HPA, PDBs, NetworkPolicies, SealedSecrets)
- **Backup:** Daily CronJob → MongoDB (dlq + audit) + MySQL (incl. SPIRE datastore) + SPIRE CA keys + checkpoints, age-encrypted, mandatory S3 off-site copy; restore drill in CI
- **Secrets:** SealedSecrets (SealedSecret → controller decrypts → standard Secret)
- **Probes:** `startupProbe` (90s window) + `livenessProbe` + `readinessProbe` on all services
- **Identity/mTLS:** SPIRE Server + Agent (K8s PSAT / Docker attestor) issuing SVIDs to `spiffe-helper` sidecars (ADR-0011)

## CI/CD

GitHub Actions workflows:

- **ci.yml** — on every push/PR: lint → typecheck (packages + services) → test+coverage (Codecov) → contract tests → E2E (Docker stack)
- **release.yml** — quality gates → Docker build/push (7 images) → GitHub Release → TypeDoc docs (manual `workflow_dispatch`)
- **deploy.yml** — manual staging/production deploy with rollback
- **backup-test.yml** — weekly restore drill of the Docker backup scripts

Pre-push git hook runs: `@biomejs/biome check` → `build` → `test`.

## Documentation

- [Documentation Index](docs/README.md) — central entry point to all docs
- [Architecture Standards](docs/standards/architecture-standards.md) — C4 diagrams, dependency graph, service conventions
- [OpenAPI 3.0](docs/services/openapi/api-gateway.yaml) — generated from the services' routes (`bun run api:write`, checked by `bun run api:check`)
- [ADR Index](docs/adr/README.md) — 11 architecture decision records
- [Compliance](docs/compliance/) — GDPR register, DPIA, retention policy, breach notification
- [Operations](docs/operations/) — runbooks, SLOs, incident response, diagnostic guide
- [Getting Started](docs/getting-started/quickstart.md) — 10-minute hands-on introduction
- [Examples](examples/) — executable bash scripts for common API workflows

## Security

- **OWASP-hardened:** anti-noSQL injection, timed-safe token comparison, log redaction
- **mTLS everywhere:** SPIFFE/SPIRE workload identity — short-lived X.509 SVIDs with automatic rotation (ADR-0011)
- **Secrets:** SealedSecrets + HMAC-signed service-to-service requests (`@trading-model/crypto`), rotation via `scripts/rotate-secrets.sh`

## Monitoring

- **Dashboards:** 4 Grafana dashboards (SLO, services, message-manager, trader-trainer)
- **Alerts:** Prometheus rules in `observability/alerting.yml` (SLO burn rates + operational), mirrored in the K8s Prometheus ConfigMap and checked by `scripts/observability-gate.mjs` and unit-tested with promtool (`tests/alerts`) → Alertmanager → Slack/PagerDuty, with a `Watchdog` dead man's switch ([Alerting](docs/operations/ALERTING.md))
- **Traces:** OpenTelemetry → OTLP Collector → Jaeger (all 7 services instrumented)
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
