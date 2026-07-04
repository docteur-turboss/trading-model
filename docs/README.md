# Documentation Index

Welcome to the **trading-model** documentation.

## Quick Links

- [Contributing](../CONTRIBUTING.md) — how to get started
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Security policy](../SECURITY.md)
- [License](../LICENSE.md)

## Standards (`docs/standards/`)

Development conventions, processes, and quality gates:

| File                                               | Content                                                     |
| -------------------------------------------------- | ----------------------------------------------------------- |
| [ARCHITECTURE.md](standards/ARCHITECTURE.md)       | Monorepo structure, service/package conventions, tech stack |
| [WRITING.md](standards/WRITING.md)                 | Code style, naming, Biome, JSDoc, import order             |
| [COMMIT.md](standards/COMMIT.md)                   | Gitmoji commit format, scopes, body/footer                  |
| [PR.md](standards/PR.md)                           | PR template, review process, labels                         |
| [CI_CD.md](standards/CI_CD.md)                     | CI and CD pipeline details                                  |
| [TESTING.md](standards/TESTING.md)                 | Jest framework, test structure, coverage thresholds         |
| [QUALITY.md](standards/QUALITY.md)                 | Linting, coverage, TypeScript strict, gates                 |
| [SECURITY.md](standards/SECURITY.md)               | mTLS, HMAC tokens, env validation, vulnerability reporting  |
| [CODE_OF_CONDUCT.md](standards/CODE_OF_CONDUCT.md) | Contributor Covenant                                        |
| [DOCUMENTATION.md](standards/DOCUMENTATION.md)     | Documentation structure and conventions                     |
| [JSDOC_STANDARD.md](standards/JSDOC_STANDARD.md)   | JSDoc formatting rules                                      |
| [DATABASE_MODELS.md](standards/DATABASE_MODELS.md) | MySQL schemas, MongoDB status                               |
| [SLO.md](standards/SLO.md)                         | Service Level Objectives and burn-rate alerting              |
| [BOUNDED_CONTEXTS.md](standards/BOUNDED_CONTEXTS.md)| DDD bounded contexts and context map                        |
| [VERIFICATION_PROTOCOL.md](standards/VERIFICATION_PROTOCOL.md) | Verification and validation protocol                |
| [HEALTH_ENDPOINTS.md](standards/HEALTH_ENDPOINTS.md)| Health check endpoint standards                              |

## Deployment & Operations (`docs/deployment/`)

| File                                                | Content                                            |
| --------------------------------------------------- | -------------------------------------------------- |
| [CONTRIBUTE.md](deployment/CONTRIBUTE.md)           | Full workflow: branch, commit, PR, review, release |
| [SETUP.md](deployment/SETUP.md)                     | Machine setup, prerequisites, installation         |
| [ENV.md](deployment/ENV.md)                         | Environment variable reference                     |
| [DATABASE.md](deployment/DATABASE.md)               | MySQL and MongoDB setup                            |
| [DEPLOY.md](deployment/DEPLOY.md)                   | Local, beta, and production deployment             |
| [DOCKER.md](deployment/DOCKER.md)                   | Docker Compose, images, networks                   |
| [CI_CD.md](deployment/CI_CD.md)                     | Workflow details and Docker patterns               |
| [TROUBLESHOOTING.md](deployment/TROUBLESHOOTING.md) | Common issues by category                          |
| [MULTI_REGION.md](deployment/MULTI_REGION.md)       | Multi-region deployment strategy                    |
| [KUBERNETES.md](deployment/KUBERNETES.md)           | Kubernetes deployment configuration                 |
| [BACKUP_DR.md](deployment/BACKUP_DR.md)             | Backup and disaster recovery                        |

## Architecture (`docs/architecture/`)

### API Documentation

Per-service and per-package API docs:

- [API index](architecture/api/README.md)
- [@trading-model/common](architecture/api/common.md)
- [@trading-model/address-manager](architecture/api/address-manager.md)
- [@trading-model/broker-message](architecture/api/broker-message.md)
- [@trading-model/certificate-utils](architecture/api/certificate-utils.md)
- [@trading-model/certificate-client](architecture/api/certificate-client.md)
- [discovery-server](architecture/api/discovery-server.md)
- [message-manager](architecture/api/message-manager.md)
- [financial-scraper](architecture/api/financial-scraper.md)
- [trader-trainer](architecture/api/trader-trainer.md)
- [certificate-authority](architecture/api/certificate-authority.md)
- [api-gateway](architecture/api/api-gateway.md)
- [audit-logger](architecture/api/audit-logger.md)
- [dlq-service](architecture/api/dlq-service.md)

### Code Documentation (TypeDoc)

TypeDoc-generated HTML documentation for all packages and services:

- [Code docs index](architecture/code/index.html)
- [@trading-model/common](architecture/code/@trading-model/common/index.html)
- [@trading-model/address-manager](architecture/code/@trading-model/address-manager/index.html)
- [@trading-model/broker-message](architecture/code/@trading-model/broker-message/index.html)

## Compliance (`docs/compliance/`)

Regulatory compliance documentation covering GDPR, MiFID II, MAR, and DORA:

| File | Content |
| ---- | ------- |
| [Compliance Framework](compliance/compliance-framework.md) | Master regulatory map — controls mapped to each regulation |
| [DPIA](compliance/dpia.md) | Data Protection Impact Assessment (CNIL PIA, Art. 35 GDPR) |
| [Data Processing Register](compliance/data-processing-register.md) | Art. 30 GDPR register — 5 processing activities |
| [Data Retention Policy](compliance/data-retention-policy.md) | Retention schedules, legal bases, and deletion mechanisms |
| [Algorithmic Trading Compliance](compliance/algorithmic-trading-compliance.md) | MiFID II Art. 17 + RTS 6 + MAR for GA/DQN agents |
| [Information Security Policy](compliance/information-security-policy.md) | ISMS framework aligned with ISO 27001:2022 — 14 control domains |
| [Access Control Policy](compliance/access-control-policy.md) | mTLS/ACL-based zero-trust service access model |
| [Incident Response Policy](compliance/incident-response-policy.md) | Incident classification, response lifecycle, regulatory notification |
| [Business Continuity Policy](compliance/business-continuity-policy.md) | BCP/DR — RTO/RPO targets, backup strategy, recovery procedures |
| [Third-Party DPAs](compliance/third-party-dpas.md) | Third-party data processing agreement assessments |


