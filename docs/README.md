# Documentation Index

Welcome to the **trading-model** documentation.

## Quick Links

- [Contributing](../CONTRIBUTING.md) — how to get started
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Security policy](../SECURITY.md)
- [License](../LICENSE.md)

## Standards (`docs/standards/`)

Development conventions, processes, and quality gates:

| File | Content |
|------|---------|
| [ARCHITECTURE.md](standards/ARCHITECTURE.md) | Monorepo structure, service/package conventions, tech stack |
| [WRITING.md](standards/WRITING.md) | Code style, naming, ESLint, JSDoc, import order |
| [COMMIT.md](standards/COMMIT.md) | Gitmoji commit format, scopes, body/footer |
| [PR.md](standards/PR.md) | PR template, review process, labels |
| [CI_CD.md](standards/CI_CD.md) | CI and CD pipeline details |
| [TESTING.md](standards/TESTING.md) | Jest framework, test structure, coverage thresholds |
| [QUALITY.md](standards/QUALITY.md) | Linting, coverage, TypeScript strict, gates |
| [SECURITY.md](standards/SECURITY.md) | mTLS, HMAC tokens, env validation, vulnerability reporting |
| [CODE_OF_CONDUCT.md](standards/CODE_OF_CONDUCT.md) | Contributor Covenant |
| [DOCUMENTATION.md](standards/DOCUMENTATION.md) | Documentation structure and conventions |
| [JSDOC_STANDARD.md](standards/JSDOC_STANDARD.md) | JSDoc formatting rules |
| [DATABASE_MODELS.md](standards/DATABASE_MODELS.md) | MySQL schemas, MongoDB status |

## Deployment & Operations (`docs/deployment/`)

| File | Content |
|------|---------|
| [CONTRIBUTE.md](deployment/CONTRIBUTE.md) | Full workflow: branch, commit, PR, review, release |
| [SETUP.md](deployment/SETUP.md) | Machine setup, prerequisites, installation |
| [ENV.md](deployment/ENV.md) | Environment variable reference |
| [DATABASE.md](deployment/DATABASE.md) | MySQL and MongoDB setup |
| [DEPLOY.md](deployment/DEPLOY.md) | Local, beta, and production deployment |
| [DOCKER.md](deployment/DOCKER.md) | Docker Compose, images, networks |
| [CI_CD.md](deployment/CI_CD.md) | Workflow details and Docker patterns |
| [TROUBLESHOOTING.md](deployment/TROUBLESHOOTING.md) | Common issues by category |

## Architecture (`docs/architecture/`)

### API Documentation

Per-service and per-package API docs:

- [API index](architecture/api/README.md)
- [@trading-model/common](architecture/api/common.md)
- [@trading-model/address-manager](architecture/api/address-manager.md)
- [@trading-model/broker-message](architecture/api/broker-message.md)
- [discovery-server](architecture/api/discovery-server.md)
- [message-manager](architecture/api/message-manager.md)
- [financial-scraper](architecture/api/financial-scraper.md)
- [trader-trainer](architecture/api/trader-trainer.md)

### Code Documentation (TypeDoc)

TypeDoc-generated HTML documentation for all packages and services:

- [Code docs index](architecture/code/index.html)
- [@trading-model/common](architecture/code/@trading-model/common/index.html)
- [@trading-model/address-manager](architecture/code/@trading-model/address-manager/index.html)
- [@trading-model/broker-message](architecture/code/@trading-model/broker-message/index.html)
- [discovery-server](architecture/code/discovery-server/index.html)
- [message-manager](architecture/code/message-manager/index.html)
- [financial-scraper](architecture/code/financial-scraper/index.html)
- [trader-trainer](architecture/code/trader-trainer/index.html)

## AI Summary (`docs/ai/`)

- [SUMMARY.md](ai/SUMMARY.md) — LLM-optimized summary of the entire codebase
