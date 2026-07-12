# Documentation Standards

## Why

Well-structured documentation is essential for onboarding new contributors, long-term maintainability, and knowledge transfer. It reduces interruptions, standardizes answers to frequent questions, and preserves project memory.

## Where

All centralized documentation resides in the `docs/` directory at the root of the monorepo.

```
docs/
├── README.md                            # Documentation index
├── getting-started/                     # Getting started guides
│   ├── README.md                        # Index
│   └── quickstart.md                    # 10-minute hands-on tour
├── reference/                           # Implementation reference
│   ├── README.md                        # Index
│   ├── genetic-algorithm.md             # GA module reference
│   ├── neural-network.md                # NN module reference
│   └── training-process.md              # Training pipeline reference
├── glossary/                            # Domain terms glossary
│   └── README.md                        # Terms & definitions
├── architecture/                        # Architecture documentation
│   ├── bounded-contexts.md              # DDD bounded contexts
│   └── databases.md                     # MySQL/MongoDB schemas
├── services/                            # Per-service documentation
│   ├── README.md                        # Index & dependency graph
│   ├── common.md                        # @trading-model/common
│   ├── address-manager.md               # @trading-model/address-manager
│   ├── broker-message.md                # @trading-model/broker-message
│   ├── certificate-utils.md             # @trading-model/certificate-utils
│   ├── certificate-client.md            # @trading-model/certificate-client
│   ├── discovery-server.md              # Service registry
│   ├── message-manager.md               # Message broker
│   ├── financial-scraper.md             # Market data ingestion
│   ├── trader-trainer.md                # GA/DQN training engine
│   ├── certificate-authority.md         # X.509 CA
│   ├── api-gateway.md                   # External API gateway
│   ├── audit-logger.md                  # Audit trail
│   ├── dlq-service.md                   # Dead letter queue
│   └── openapi/                         # OpenAPI specs
├── standards/                           # Development standards
│   ├── README.md                        # Index
│   ├── architecture-standards.md        # Architecture standards
│   ├── code-style.md                    # Code style
│   ├── commit-standards.md              # Commit conventions
│   ├── pr-standards.md                  # Pull request standards
│   ├── testing-standards.md             # Testing standards
│   ├── quality-gates.md                 # Quality standards
│   ├── jsdoc-standards.md               # JSDoc writing rules
│   └── health-endpoints.md              # Health check standards
├── security/                            # Security documentation
│   ├── README.md                        # Index
│   └── practices.md                     # Security practices
├── contributing/                        # Contribution guides
│   ├── README.md                        # Index
│   ├── workflow.md                      # Full contribution workflow
│   ├── adding-a-service.md              # How to add a new service
│   └── documentation-standards.md       # Documentation conventions
├── ci-cd/                               # CI/CD pipeline
│   └── README.md                        # Pipeline standards and workflows
├── troubleshooting/                     # Troubleshooting
│   └── README.md                        # Common issues, diagnostics, recovery
├── deployment/                          # Deployment procedures
│   ├── README.md                        # Index & quick reference
│   ├── DATABASE.md                      # Database deployment
│   ├── DEPLOY.md                        # Deployment procedures
│   ├── DOCKER.md                        # Docker norms
│   ├── ENV.md                           # Environment variables
│   ├── SETUP.md                         # Machine setup
│   ├── KUBERNETES.md                    # K8s configuration
│   ├── MULTI_REGION.md                  # Multi-region strategy
│   ├── sealed-secrets.md               # Encrypted K8s secrets
│   └── BACKUP_DR.md                     # Backup & disaster recovery
├── operations/                          # Operational procedures
│   ├── README.md                        # Index
│   ├── slo.md                           # Service Level Objectives
│   ├── incident-response.md             # Incident management
│   ├── on-call.md                       # On-call procedures
│   └── runbooks/                        # Runbooks (7 files)
│       ├── runbook-service-down.md          # Service crash recovery
│       ├── runbook-database-failover.md     # Database failover
│       ├── runbook-ca-compromise.md         # CA key compromise
│       ├── runbook-message-bus-outage.md    # Message bus outage
│       ├── runbook-certificate-expiry.md    # Certificate expiry
│       ├── runbook-data-corruption.md       # Data corruption
│       └── runbook-deployment-failure.md    # Deployment rollback
├── compliance/                          # Regulatory compliance
│   ├── compliance-framework.md          # Master regulatory map
│   ├── dpia.md                          # Data Protection Impact Assessment
│   ├── data-processing-register.md      # Art. 30 GDPR register
│   ├── data-retention-policy.md         # Retention schedules
│   ├── algorithmic-trading-compliance.md # MiFID II / MAR
│   ├── information-security-policy.md   # ISO 27001 ISMS
│   ├── access-control-policy.md         # Zero-trust access
│   ├── incident-response-policy.md      # Incident classification
│   ├── business-continuity-policy.md    # BCP/DR
│   └── third-party-dpas.md             # Third-party DPAs
├── adr/                                 # Architecture Decision Records
│   ├── README.md                        # Index
│   ├── 0001-ga-dqn-training.md
│   ├── ... (10 ADRs)
│   └── 0010-clean-architecture-migration.md
├── architecture/code/                   # TypeDoc-generated HTML
│   └── ...
└── examples/                            # Example scripts
    └── README.md
```

## How to Use This Documentation

See [docs/README.md](../README.md) for the central navigation index.

Platform-level implementation reference docs (GA, NN, training) are in `docs/reference/`. Per-service documentation is in `docs/services/`. TypeDoc-generated code documentation is in `docs/architecture/code/`.

## How

- **Format**: Markdown (`.md`)
- **Language**: English (all documentation)
- **Code blocks**: Always with a language tag (`typescript`, `bash`, `json`, `yaml`)
- **Headers**: Clear hierarchy (`#` title, `##` section, `###` subsection)
- **Tables**: Use Markdown tables for structured information
- **Links**: Relative paths for internal project references

## Examples

### Code Block with Tag

```typescript
import { createBootstrap } from '@trading-model/common/server/bootstrap';

createBootstrap({
  name: 'Discovery',
  createServer: createServer,
});
```

```bash
npm run build:common && npm run build:address-manager && npm run build:broker-message
```

```yaml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: npm ci
      - run: npm run lint
```

## References

- [JSDoc Standards](../standards/jsdoc-standards.md) — JSDoc writing rules
- [Code Style](../standards/code-style.md) — Code writing standards
