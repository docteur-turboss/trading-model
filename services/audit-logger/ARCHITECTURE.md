# Architecture — Audit Logger

Routes, storage, environment and behaviour: [docs/services/audit-logger.md](../../docs/services/audit-logger.md). This file only holds the source layout.

## Project Structure

```
services/audit-logger/
├── src/
│   ├── domain/                   # Pure: audit chain, date range
│   │   └── ports/                # Audit chain ports
│   ├── application/
│   │   ├── index.ts              # Entry point: bootstrap, MongoDB connect, broker subscription
│   │   ├── server.ts             # Express server factory
│   │   ├── chain-cli.ts          # Operator CLI (package.json bin "audit-chain", ADR-0027)
│   │   └── audit-chain/          # Chain verification + anchoring scheduler
│   ├── adapters/
│   │   ├── inbound/
│   │   │   ├── http/             # Controllers, routes, query-param parsing
│   │   │   └── subscription/     # Bus → repository ingestion, message parsing
│   │   └── outbound/
│   │       ├── persistence/      # MongoDB repositories (audit events, chain state), filters, stats
│   │       └── anchor/           # S3 anchor store
│   ├── infrastructure/
│   │   └── config/env.ts         # Zod-validated environment
│   └── config/
│       ├── container.ts          # Composition root: Mongo repositories, chain audit, message handler,
│       │                         # server — createAuditLoggerApp()
│       ├── broker-setup.ts       # Message bus subscription wiring
│       ├── metrics.ts            # Prometheus collectors
│       └── address-manager.ts
├── tests/
├── Dockerfile
├── package.json
└── tsconfig.json
```
