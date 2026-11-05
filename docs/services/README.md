# Services

This directory documents every package and service in the **trading-model** monorepo.

> See [Architecture Standards](../standards/architecture-standards.md) for the dependency graph and tech stack, and [Security](../security/README.md) for the security model.

## Packages

| Package                          | Path                        | Documentation                              |
| -------------------------------- | --------------------------- | ------------------------------------------ |
| `@trading-model/primitives`      | `packages/primitives/`      | [primitives.md](./primitives.md)                                          |
| `@trading-model/contracts`       | `packages/contracts/`       | [contracts.md](./contracts.md)                                          |
| `@trading-model/reliability`     | `packages/reliability/`     | [reliability.md](./reliability.md)                                          |
| `@trading-model/common`          | `packages/common/`          | [common.md](./common.md)                   |
| `@trading-model/persistence`     | `packages/persistence/`     | [persistence.md](./persistence.md)                                          |
| `@trading-model/http`            | `packages/http/`            | [http.md](./http.md)                                          |
| `@trading-model/validation`      | `packages/validation/`      | [validation.md](./validation.md)                                          |
| `@trading-model/server-utils`    | `packages/server-utils/`    | [server-utils.md](./server-utils.md)                                          |
| `@trading-model/crypto`          | `packages/crypto/`          | [crypto.md](./crypto.md)                                          |
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

No frontend for now: `admin-interface` was removed ([ADR-0018](../adr/0018-temporary-frontend-removal.md)).

To add a new service, see [How to Add a New Service](../contributing/adding-a-service.md).

## Technical Debt

See [Architecture Standards](../standards/architecture-standards.md#known-technical-debt) for known technical debt items.
