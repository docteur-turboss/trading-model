# ADR-0006: Monorepo Structure with bun Workspaces

**Status:** Accepted
**Date:** 2026-06

## Context

The platform consists of 5 shared libraries and 9 microservices that must be developed, tested, and deployed together. Key requirements:

- Shared type definitions across all services
- Consistent build and test tooling
- Atomic commits across packages and services
- Easy local development without publishing packages

## Decision

Use a **monorepo** managed by **bun workspaces** with the following structure:

```
trading-model/
├── packages/     # Shared libraries (@trading-model/*)
├── services/     # Independently deployable microservices
├── docs/         # Centralized documentation
├── scripts/      # Build/deploy utilities
├── deploy/       # nginx configs, K8s manifests
├── observability/ # Prometheus, Grafana, OTEL configs
├── tests/        # Contract + E2E tests
└── .github/      # CI/CD workflows
```

## Alternatives Considered

| Alternative                             | Reason for Rejection                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Multi-repo (separate repos per service) | Coordination overhead; no atomic cross-repo changes; harder shared type management |
| Lerna                                   | Additional tooling; bun workspaces now support all needed features                 |
| pnpm workspaces                         | Faster installs but adds toolchain complexity; team familiar with bun              |
| Bazel                                   | Overkill for this project size; steep learning curve                               |

## Consequences

### Positive

- Single `bun install --frozen-lockfile` installs all dependencies
- Shared TypeScript types via `@trading-model/*` without publishing
- Biome and TypeScript config shared at root level
- Husky hooks enforce commit format, linting, and tests before push
- CI/CD can build and test everything in one workflow

### Negative

- Build order matters (packages must build before services)
- Root `node_modules` size grows with all dependencies
- Git history is shared — large refactors touch many files
- Workspace command naming requires care (`bun run --filter trader-service test` vs directory `services/trader-trainer`)

### Mitigations

- Build scripts enforce package dependency order
- Weekly `bun audit` and Dependabot for dependency updates
- `commitlint` enforces structured commit messages with scopes
- `AGENTS.md` documents workspace quirks (naming, build order)
