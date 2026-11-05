# Architecture

This section describes the system architecture, DDD bounded contexts, and database schemas.

| Document | Content |
| -------- | ------- |
| [System Overview](system-overview.md) | C4 context and containers, Kubernetes deployment, market data sequence |
| [Bounded Contexts](bounded-contexts.md) | DDD context map with inter-service integration patterns |
| [Databases](databases.md) | Database engines, entity relationships, storage strategy |
| [Table Schemas](../reference/table-schemas.md) | Full DDL, column definitions, TypeScript interfaces |
| Code Documentation | TypeDoc HTML, not versioned (ADR-0036): build locally with `bun run docs:generate` into `code/` (git-ignored) |

## Service Architecture

See [Services](../services/README.md) for per-service documentation and the dependency graph.
