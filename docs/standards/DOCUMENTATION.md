# Documentation Standards

## Why

Well-structured documentation is essential for onboarding new contributors, long-term maintainability, and knowledge transfer. It reduces interruptions, standardizes answers to frequent questions, and preserves project memory.

## Where

All centralized documentation resides in the `docs/` directory at the root of the monorepo.

```
docs/
├── standards/                          # Standards documentation
│   ├── README.md                       # Index
│   ├── ARCHITECTURE.md                 # Architecture standards
│   ├── WRITING.md                      # Code & JSDoc writing standards
│   ├── DOCUMENTATION.md                # Documentation standards (this file)
│   ├── COMMIT.md                       # Commit conventions
│   ├── PR.md                           # Pull request standards
│   ├── CI_CD.md                        # CI/CD standards
│   ├── SECURITY.md                     # Security standards
│   ├── TESTING.md                      # Testing standards
│   ├── QUALITY.md                      # Quality standards
│   ├── CODE_OF_CONDUCT.md              # Code of conduct
│   ├── DATABASE_MODELS.md              # Database schemas
│   └── JSDOC_STANDARD.md               # JSDoc writing rules
├── deployment/                         # Deployment & operations
│   ├── README.md                       # Index
│   ├── CI_CD.md                        # CI/CD pipeline details
│   ├── CONTRIBUTE.md                   # Contribution workflow
│   ├── DATABASE.md                     # Database deployment
│   ├── DEPLOY.md                       # Deployment procedures
│   ├── DOCKER.md                       # Docker norms
│   ├── ENV.md                          # Environment variables
│   ├── SETUP.md                        # Machine setup
│   └── TROUBLESHOOTING.md              # Common issues
├── architecture/                       # Architecture documentation
│   ├── api/                            # Per-service API docs
│   │   ├── README.md
│   │   ├── common.md
│   │   ├── address-manager.md
│   │   ├── broker-message.md
│   │   ├── discovery-server.md
│   │   ├── message-manager.md
│   │   ├── financial-scraper.md
│   │   └── trader-trainer.md
│   └── code/                           # TypeDoc-generated HTML
│       ├── index.html
│       ├── @trading-model/common/
│       ├── @trading-model/address-manager/
│       ├── @trading-model/broker-message/
│       ├── discovery-server/
│       ├── message-manager/
│       ├── financial-scraper/
│       └── trader-trainer/
└── ai/                                 # AI/LLM-optimized summaries
    └── SUMMARY.md
└── standards/               # This folder — detailed standards
    ├── README.md            # Standards index
    ├── ARCHITECTURE.md      # Architecture standards
    ├── WRITING.md           # Writing standards (code & JSDoc)
    ├── DOCUMENTATION.md     # Documentation standards
    ├── COMMIT.md            # Commit standards
    ├── PR.md                # Pull request standards
    ├── CI_CD.md             # CI/CD standards
    ├── SECURITY.md          # Security standards
    ├── TESTING.md           # Testing standards
    └── QUALITY.md           # Quality standards
```

## Documentation Structure

The documentation is organized into focused subdirectories with a clear separation of concerns:

| Directory                 | Content                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `docs/standards/`         | Development standards (architecture, writing, commit, PR, CI/CD, security, testing, quality) |
| `docs/deployment/`        | Deployment & operations (CI/CD, Docker, setup, deploy, database, env vars, troubleshooting)  |
| `docs/architecture/api/`  | Per-package and per-service API documentation                                                |
| `docs/architecture/code/` | TypeDoc-generated HTML code documentation                                                    |
| `docs/ai/`                | AI/LLM-optimized summaries                                                                   |

### Standards Documentation (`docs/standards/`)

| File                 | Content                                                   |
| -------------------- | --------------------------------------------------------- |
| `ARCHITECTURE.md`    | Architecture standards, dependency graph, conventions     |
| `WRITING.md`         | Code & JSDoc writing rules (naming, formatting, style)    |
| `DOCUMENTATION.md`   | Documentation structure and conventions (this file)       |
| `COMMIT.md`          | Commit message format (gitmoji, scopes, body/footer)      |
| `PR.md`              | Pull request standards and template reference             |
| `CI_CD.md`           | CI/CD pipeline standards                                  |
| `SECURITY.md`        | Security standards, vulnerability reporting               |
| `TESTING.md`         | Testing standards (framework, coverage, structure)        |
| `QUALITY.md`         | Quality standards (linting, tooling, gates)               |
| `CODE_OF_CONDUCT.md` | Code of conduct for contributors                          |
| `JSDOC_STANDARD.md`  | JSDoc specific formatting rules (3rd person, param style) |
| `DATABASE_MODELS.md` | MySQL and MongoDB schemas, table definitions              |

### Deployment Documentation (`docs/deployment/`)

| File                 | Content                                                   |
| -------------------- | --------------------------------------------------------- |
| `README.md`          | Deployment index                                          |
| `CI_CD.md`           | ci.yml and release.yml workflow details                   |
| `CONTRIBUTE.md`      | Full contribution workflow (idea → production)            |
| `DATABASE.md`        | Database deployment and management (MySQL, MongoDB)       |
| `DEPLOY.md`          | Deployment procedures (local, beta, production, rollback) |
| `DOCKER.md`          | Docker norms (multi-stage builds, images, compose)        |
| `ENV.md`             | Complete environment variable reference                   |
| `SETUP.md`           | Machine setup guides (local dev + production fleet)       |
| `TROUBLESHOOTING.md` | Common issues and solutions by category                   |

### Architecture / API Documentation (`docs/architecture/api/`)

| File                   | Content                                             |
| ---------------------- | --------------------------------------------------- |
| `README.md`            | Architecture overview, tech stack, dependency graph |
| `common.md`            | @trading-model/common package API                   |
| `address-manager.md`   | @trading-model/address-manager package API          |
| `broker-message.md`    | @trading-model/broker-message package API           |
| `discovery-server.md`  | discovery-service API endpoints                     |
| `message-manager.md`   | message-delivery-service API endpoints              |
| `financial-scraper.md` | financial-scraper-service API endpoints             |
| `trader-trainer.md`    | trader-training-service API endpoints               |

### Service-Specific Documentation

Each service has API docs in `docs/architecture/api/` and TypeDoc-generated code docs in `docs/architecture/code/`. Some services also maintain additional documentation in `services/<name>/` at the service root:

```
services/trader-trainer/
├── ARCHITECTURE.md          # Service-specific architecture
├── README.md                # Service overview
└── docs/                    # Internal architecture docs
    ├── NEURAL_NETWORK.md
    ├── GENETIC_ALGORITHM.md
    ├── TRAINING_PROCESS.md
    ├── TECHNICAL_OVERVIEW.md
    ├── INTEGRATION.md
    └── API.md
```

## How

- **Format**: Markdown (`.md`)
- **Language**: English (all documentation)
- **Code blocks**: Always with a language tag (`typescript, `bash, `json, `yaml)
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

- [JSDOC_STANDARD.md](./JSDOC_STANDARD.md) — JSDoc writing rules
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Code of conduct
- [WRITING.md](./WRITING.md) — Code writing standards
