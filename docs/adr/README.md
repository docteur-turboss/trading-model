# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the trading-model platform.

## What is an ADR?

An ADR documents a significant architectural decision, including the context, alternatives considered, and the rationale for the chosen approach. ADRs are immutable once accepted — superseded decisions are documented in a new ADR that references the old one.

## Index

| ADR                                           | Title                                                  | Status   | Date    |
| --------------------------------------------- | ------------------------------------------------------ | -------- | ------- |
| [ADR-0001](./0001-ga-dqn-training.md)         | Genetic Algorithm + Deep Q-Learning for Agent Training | Accepted | 2026-06 |
| [ADR-0002](./0002-redis-pub-sub.md)           | Redis Streams for Inter-Service Messaging              | Accepted | 2026-06 |
| [ADR-0003](./0003-mongodb-persistence.md)     | MongoDB for Audit and DLQ Persistence                    | Accepted | 2026-06 |
| [ADR-0004](./0004-mysql-group-replication.md) | MySQL with Group Replication for Market Data           | Accepted | 2026-06 |
| [ADR-0005](./0005-mtls-security.md)           | Mutual TLS for All Inter-Service Communication         | Superseded | 2026-06 |
| [ADR-0006](./0006-monorepo-bun-workspaces.md) | Monorepo Structure with bun Workspaces                 | Accepted | 2026-06 |
| [ADR-0007](./0007-common-package-split.md)   | Common Package Split                                   | Implemented | 2026-06 |
| [ADR-0008](./0008-message-broker-choice.md)  | Message Broker Choice                                  | Accepted | 2026-06 |
| [ADR-0009](./0009-certificate-utils-structure.md) | Certificate Utils Structure                       | Superseded | 2026-06 |
| [ADR-0010](./0010-clean-architecture-migration.md) | Clean Architecture Migration                    | Implemented | 2026-06 |
| [ADR-0011](./0011-spiffe-spire-workload-identity.md) | SPIFFE/SPIRE Workload Identity                 | Accepted | 2026-09 |
| [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) | Dead Code Removal via Reachability Analysis and Runtime Entrypoint Fix | Accepted | 2026-10 |
| [ADR-0013](./0013-config-gated-dead-code-removal.md) | Removal of Configuration-Gated Dead Code Missed by Import Reachability (address-manager Discovery WebSocket Client) | Accepted | 2026-10 |
| [ADR-0015](./0015-hexagonal-layering-completion.md) | Hexagonal Layering Completion Across Services | Accepted | 2026-10 |
| [ADR-0016](./0016-shared-contracts-ownership.md) | Shared Contracts Owned by `@trading-model/contracts` and Manifest-Checked Dependencies | Accepted | 2026-10 |
