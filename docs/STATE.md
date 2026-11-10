---
type: etat
domaine: monorepo
maj: 2026-10-28
tags: [state, memory, architecture, verification]
statut: actif
---

# System State (STATE.md)

> **Canonical repository memory.** An agent's context window is work in progress,
> not memory. The repository IS the memory: this page is its map.
> It is re-read at every cold start, by a human or an agent.

## What it is

`trading-model` is an algorithmic trading monorepo: 11 shared packages
(scoped `@trading-model/*`) + 7 microservices, linked by bun workspaces.

- **Packages** : primitives, contracts, reliability, common, persistence, http, validation, server-utils, crypto, address-manager, broker-message
- **Services**: message-manager, discovery-server, financial-scraper, trader-trainer (package name: `trader-service`), api-gateway, audit-logger, dlq-service. No frontend: `admin-interface` temporarily removed (ADR-0018)
- **Data**: MySQL (financial-scraper), SQLite (SPIRE datastore, ADR-0062), MongoDB (audit-logger, dlq-service), Redis (message-manager)
- **Identity/mTLS**: SPIRE/SPIFFE (ADR-0011), mandatory in Docker and K8s
- **Current version**: `2.0.3`, released through GitHub Actions (`Release` workflow)

## Non-negotiable invariants

1. Ordered build: the 11 packages in dependency order (see [`AGENTS.md`](../AGENTS.md)), then the services.
2. Test coverage ≥ 80% (branches, functions, lines); exceptions are versioned.
3. Quality: lint (Biome, 0 errors) and tests green before any push. See [CI/CD](ci-cd/README.md).
4. SQL migration numbering is ascending; journals are append-only.
5. No plaintext secret in the repository (env vars / sealed secrets).

## Cold-start protocol

Mandatory reading order. Never read everything at once:

1. [`AGENTS.md`](../AGENTS.md): commands, layout, pitfalls (trader-trainer ≠ trader-service).
2. **This file** (`docs/STATE.md`): the map.
3. Only then: `docs/standards/*`, the docs of the relevant service (`docs/services/*`), the ADRs (`docs/adr/`), the specs (`docs/spec/SPEC-*.md`).
4. Tests as executable memory: breaking a test must be a discovery, not a surprise.

## Links

- [Root README](../README.md): repository entry point
- [Quality standards](standards/README.md)
- [CI/CD pipeline](ci-cd/README.md)
- [Architecture decisions (ADRs)](adr/README.md)
- [Spec template](spec/TEMPLATE.md): traceable requirements
