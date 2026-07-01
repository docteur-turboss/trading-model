# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the trading-model platform.

## What is an ADR?

An ADR documents a significant architectural decision, including the context, alternatives considered, and the rationale for the chosen approach. ADRs are immutable once accepted — superseded decisions are documented in a new ADR that references the old one.

## Index

| ADR                                           | Title                                                  | Status   | Date    |
| --------------------------------------------- | ------------------------------------------------------ | -------- | ------- |
| [ADR-0001](./0001-ga-dqn-training.md)         | Genetic Algorithm + Deep Q-Learning for Agent Training | Accepted | 2026-06 |
| [ADR-0002](./0002-redis-pub-sub.md)           | Redis Streams for Inter-Service Messaging              | Accepted | 2026-06 |
| [ADR-0003](./0003-mongodb-persistence.md)     | MongoDB for Audit, CA, and DLQ Persistence             | Accepted | 2026-06 |
| [ADR-0004](./0004-mysql-group-replication.md) | MySQL with Group Replication for Market Data           | Accepted | 2026-06 |
| [ADR-0005](./0005-mtls-security.md)           | Mutual TLS for All Inter-Service Communication         | Accepted | 2026-06 |
| [ADR-0006](./0006-monorepo-npm-workspaces.md) | Monorepo Structure with npm Workspaces                 | Accepted | 2026-06 |
