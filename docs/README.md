# Documentation Index

Welcome to the **trading-model** documentation.

## Getting Started

| Guide | Description |
| ----- | ----------- |
| [Quick Start](getting-started/quickstart.md) | 10-minute hands-on tutorial |
| [Setup Guide](deployment/SETUP.md) | Full machine setup and prerequisites |

## Architecture

| Document | Description |
| -------- | ----------- |
| [Architecture Standards](standards/architecture-standards.md) | Monorepo structure, tech stack, service conventions, dependency graph |
| [Bounded Contexts](architecture/bounded-contexts.md) | DDD context map with integration patterns |
| [Databases](architecture/databases.md) | MySQL schemas, MongoDB collections, entity definitions |
| [ADR Index](adr/README.md) | 11 architecture decision records |

## Concepts

Conceptual explanations of core algorithms, independent of implementation:

| Document | Description |
| -------- | ----------- |
| [Genetic Algorithm](concepts/genetic-algorithm.md) | NSGA-II, Pareto front, selection, crossover, mutation |
| [Neural Network](concepts/neural-network.md) | Feedforward networks, DQN, backpropagation, experience replay |
| [Training Process](concepts/training-process.md) | Walk-forward validation, feature engineering, reward shaping |

## Services & Packages

Per-service and per-package documentation ([full index](services/README.md)):

| Service | Port | Purpose |
| ------- | ---- | ------- |
| `discovery-server` | 8443 | Service registry with TTL leases + HMAC tokens |
| `message-manager` | 8444 | Topic-based pub/sub broker with DLQ routing |
| `financial-scraper` | 8445 | Binance market data ingestion |
| `trader-trainer` | 8446 | GA + DQN agent evolution engine |
| `api-gateway` | 8448 | External entry point: auth, rate-limit, cache, proxy |
| `admin-interface` | 8449 | React SPA dashboard |
| `audit-logger` | 8450 | Immutable event traceability |
| `dlq-service` | 8452 | Dead letter queue with auto-retry + replay |

## Deployment & Operations

| Section | Description |
| ------- | ----------- |
| [Deployment](deployment/README.md) | Docker, K8s, CI/CD, backup, multi-region |
| [Operations](operations/README.md) | Runbooks, SLOs, incident response, on-call |
| [Standards](standards/README.md) | Code style, commit conventions, testing, PRs, architecture |
| [Troubleshooting](troubleshooting/README.md) | Common issues, diagnostics, recovery |
| [CI/CD](ci-cd/README.md) | Pipeline standards and workflows |

## Development Standards

| Document | Description |
| -------- | ----------- |
| [Commit Standards](standards/commit-standards.md) | Gitmoji format, scopes, body/footer |
| [PR Standards](standards/pr-standards.md) | Review process, labels, template |
| [Testing Standards](standards/testing-standards.md) | Jest/Vitest, coverage thresholds, patterns |
| [Code Style](standards/code-style.md) | Naming, Biome, import order |
| [JSDoc Standard](standards/jsdoc-standards.md) | JSDoc formatting rules |
| [Verification Protocol](standards/verification-protocol.md) | Quality gates before commit, PR, release |
| [Health Endpoints](standards/health-endpoints.md) | Health check endpoint standards |

## Reference

| Document | Description |
| -------- | ----------- |
| [Genetic Algorithm](reference/genetic-algorithm.md) | GA module implementation: types, API, code structure |
| [Neural Network](reference/neural-network.md) | NN module implementation: class API, configuration, types |
| [Training Process](reference/training-process.md) | Training pipeline implementation: flow, trigger, evaluation |

## Cross-Cutting Concerns

| Section | Description |
| ------- | ----------- |
| [Security](security/README.md) | mTLS, token auth, vulnerability reporting |
| [Compliance](compliance/README.md) | GDPR, MiFID II, MAR, DORA documentation |
| [Glossary](glossary/README.md) | Domain terms (GA, DQN, mTLS, Sharpe ratio, etc.) |
| [Contributing](contributing/README.md) | Contribution workflow, adding services, documentation standards |
| [Examples](../../examples/) | Executable API workflow scripts |

## Code Documentation

TypeDoc-generated HTML: `bun run docs:generate` — output at `docs/architecture/code/index.html`.
