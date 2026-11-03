# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the trading-model platform.

## What is an ADR?

An ADR documents a significant architectural decision, including the context, alternatives considered, and the rationale for the chosen approach. ADRs are immutable once accepted — superseded decisions are documented in a new ADR that references the old one.

## Index

| ADR                                           | Title                                                  | Status   | Date    |
| --------------------------------------------- | ------------------------------------------------------ | -------- | ------- |
| [ADR-0001](./0001-ga-dqn-training.md)         | Genetic Algorithm + Deep Q-Learning for Agent Training | Accepted | 2026-06 |
| [ADR-0002](./0002-redis-pub-sub.md)           | Redis Streams for Inter-Service Messaging              | Superseded | 2026-06 |
| [ADR-0003](./0003-mongodb-persistence.md)     | MongoDB for Audit and DLQ Persistence                    | Superseded | 2026-06 |
| [ADR-0004](./0004-mysql-group-replication.md) | MySQL with Group Replication for Market Data           | Superseded | 2026-06 |
| [ADR-0005](./0005-mtls-security.md)           | Mutual TLS for All Inter-Service Communication         | Superseded | 2026-06 |
| [ADR-0006](./0006-monorepo-bun-workspaces.md) | Monorepo Structure with bun Workspaces                 | Accepted | 2026-06 |
| [ADR-0007](./0007-common-package-split.md)   | Common Package Split                                   | Implemented | 2026-06 |
| [ADR-0008](./0008-message-broker-choice.md)  | Message Broker Choice                                  | Superseded | 2026-06 |
| [ADR-0009](./0009-certificate-utils-structure.md) | Certificate Utils Structure                       | Superseded | 2026-06 |
| [ADR-0010](./0010-clean-architecture-migration.md) | Clean Architecture Migration                    | Implemented | 2026-06 |
| [ADR-0011](./0011-spiffe-spire-workload-identity.md) | SPIFFE/SPIRE Workload Identity                 | Accepted | 2026-09 |
| [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) | Dead Code Removal via Reachability Analysis and Runtime Entrypoint Fix | Accepted | 2026-10 |
| [ADR-0013](./0013-config-gated-dead-code-removal.md) | Removal of Configuration-Gated Dead Code Missed by Import Reachability (address-manager Discovery WebSocket Client) | Accepted | 2026-10 |
| [ADR-0015](./0015-hexagonal-layering-completion.md) | Hexagonal Layering Completion Across Services | Accepted | 2026-10 |
| [ADR-0016](./0016-shared-contracts-ownership.md) | Shared Contracts Owned by `@trading-model/contracts` and Manifest-Checked Dependencies | Accepted | 2026-10 |
| [ADR-0017](./0017-no-swallowed-errors.md) | No Swallowed Errors — Lint Rule, GritQL Plugin and Review Criterion | Accepted | 2026-10 |
| [ADR-0018](./0018-temporary-frontend-removal.md) | Temporary Removal of the Admin Frontend (`admin-interface`) | Accepted | 2026-10 |
| [ADR-0019](./0019-message-broker-as-built.md) | Message Broker As Built — HTTP Pub/Sub Without Message Persistence | Accepted | 2026-10 |
| [ADR-0020](./0020-database-topology-as-deployed.md) | Database Topology As Deployed — MySQL and MongoDB | Accepted | 2026-10 |
| [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) | HTTP API Schemas Owned by Services, OpenAPI Generated From Zod | Accepted | 2026-10 |
| [ADR-0022](./0022-versioned-model-artifacts.md) | Versioned Model Artifacts Instead of Genomes in the Public API | Accepted | 2026-10 |
| [ADR-0023](./0023-discovery-registry-in-redis.md) | Discovery Registry Shared Through Redis | Accepted | 2026-10 |
| [ADR-0024](./0024-pod-spread-across-nodes.md) | Replicas Spread Evenly Across Nodes | Accepted | 2026-10 |
| [ADR-0025](./0025-ga-fitness-wired-to-fitness-type.md) | GA Fitness Computed on Wallet PnL and Selected by `fitnessType`; DQN Learning From Its Own Experience | Accepted | 2026-10 |
| [ADR-0026](./0026-binance-public-market-data-kept.md) | Binance Kept as the Market Data Source While Its Public API Answers From the EU | Accepted | 2026-10 |
| [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) | Audit Trail Verified by audit-logger and Anchored Outside MongoDB | Accepted | 2026-10 |
| [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md) | Orphan Subsystems Retired (audit-logger Job Scheduler, `@trading-model/jobs`) and Reachability Made a Gate | Accepted | 2026-10 |
| [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) | Point-in-Time Features and Explicit Success Criteria for the MT4 Walk-Forward Validation | Accepted | 2026-10 |

## Keeping ADRs true to the runtime

`bun run adr:check` (`scripts/adr-check.mjs`, run by pre-push and CI) enforces:

- **Status** is one of Proposed, Accepted, Implemented, Deprecated, or `Superseded by [ADR-NNNN](./NNNN-....md)`.
- **Supersession goes both ways.** The successor has a `**Supersedes:**` line linking back, and every ADR it supersedes says so. When a change removes or replaces what an ADR decided (as ADR-0012 did for ADR-0002/0008), write the superseding ADR in the same change.
- **Every Accepted or Implemented ADR has a `**Verified by:**` line** naming, in backticks, what proves it today: a `bun run <script>`, a test file, or a script run by a gate. When nothing automated can, write `manual review YYYY-MM-DD`; reviews older than 180 days are reported.
- This index lists every ADR once, with its status.

The check proves that each decision is tied to a live check, not that the check covers every sentence of the ADR: when you change what an ADR describes, update the check it names.
