# Services

This directory documents every package and service in the **trading-model** monorepo.

> See [Architecture Standards](../standards/architecture-standards.md) for the dependency graph and tech stack, and [Security](../security/README.md) for the security model.

## Packages

| Package                          | Path                        | Documentation                              |
| -------------------------------- | --------------------------- | ------------------------------------------ |
| `@trading-model/common`          | `packages/common/`          | [common.md](./common.md)                   |
| `@trading-model/validation`      | `packages/validation/`      | —                                          |
| `@trading-model/server-utils`    | `packages/server-utils/`    | —                                          |
| `@trading-model/crypto`          | `packages/crypto/`          | —                                          |
| `@trading-model/address-manager` | `packages/address-manager/` | [address-manager.md](./address-manager.md) |
| `@trading-model/broker-message`  | `packages/broker-message/`  | [broker-message.md](./broker-message.md)   |

## Services

| Service               | Path                              | Documentation                                      |
| --------------------- | --------------------------------- | -------------------------------------------------- |
| discovery-server      | `services/discovery-server/`      | [discovery-server.md](./discovery-server.md)       |
| message-manager       | `services/message-manager/`       | [message-manager.md](./message-manager.md)         |
| financial-scraper     | `services/financial-scraper/`     | [financial-scraper.md](./financial-scraper.md)     |
| trader-trainer        | `services/trader-trainer/`        | [trader-trainer.md](./trader-trainer.md)           |
| api-gateway           | `services/api-gateway/`           | [api-gateway.md](./api-gateway.md)                 |
| audit-logger          | `services/audit-logger/`          | [audit-logger.md](./audit-logger.md)               |
| dlq-service           | `services/dlq-service/`           | [dlq-service.md](./dlq-service.md)                 |
| admin-interface       | `services/admin-interface/`       | _(React SPA, no API docs)_                         |

To add a new service, see [How to Add a New Service](../contributing/adding-a-service.md).

## Technical Debt

See [Architecture Standards](../standards/architecture-standards.md#known-technical-debt) for known technical debt items.
