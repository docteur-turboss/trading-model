# discovery-server

Central service registry for the microservice platform. Handles service instance registration, TTL-based heartbeat liveness, authentication token rotation, and service discovery queries.

## Prerequisites

- Node.js 18+
- mTLS automatique via SPIRE (ADR-0011) — aucun certificat manuel à générer
- `@trading-model/common` workspace dependency

## Installation

```bash
bun install
bun run build
```

## Configuration

All configuration is via environment variables, validated by `BaseEnvSchema` + `DiscoveryEnvSchema`:

| Variable                      | Default       | Description                      |
| ----------------------------- | ------------- | -------------------------------- |
| `NODE_ENV`                    | `development` | Runtime environment              |
| `PORT`                        | `3000`        | HTTPS listen port                |
| `TLS_KEY_PATH`                | —             | Path to server private key       |
| `TLS_CERT_PATH`               | —             | Path to server certificate       |
| `TLS_CA_PATH`                 | —             | Path to SPIRE trust bundle       |
| `LOG_LEVEL`                   | `info`        | Logger level                     |
| `CLEANUP_SERVICE_INTERVAL_MS` | `600000`      | Lease cleanup interval           |
| `ERROR_URL_WEBHOOK`           | —             | Webhook URL for error forwarding |

Copy `.env.example` to `.env` and fill in the values.

## Running

```bash
bun run dev     # ts-node src/application/index.ts
bun run build   # tsc
```

## Testing

```bash
bun run test                          # all tests
bun run test --watch               # watch mode
bun run test --coverage            # with coverage report
```

### Test structure

```
tests/
├── fixtures/                     # Reusable test data factories
├── helpers/                      # Test utilities (createReq, etc.)
├── unit/
│   ├── ServiceRegistry.spec.ts   # Registry CRUD + token logic
│   ├── LeaseManager.spec.ts      # Start/stop/liveness checks
│   ├── env.spec.ts               # Environment config validation
│   ├── helpers.spec.ts           # Controller helpers
│   └── controllers/
│       ├── Register.controller.spec.ts
│       └── Heartbeat.controller.spec.ts
└── integration/
    └── discovery-flow.spec.ts    # Full register → heartbeat → rotate flow
```

## API

### POST /register

Register a new service instance or update an existing one.

```json
{
  "serviceName": "financial-scraper",
  "ip": "10.0.0.1",
  "port": 8444,
  "instanceId": "optional-custom-id"
}
```

Returns the registered instance with an auth token.

### POST /heartbeat

Refresh the lease TTL for an instance. Requires `x-instance-token` header.

```json
{ "serviceName": "financial-scraper", "instanceId": "abc123" }
```

Returns `{ ttl: number }`.

### POST /token/rotate

Rotate the auth token for an instance. Requires `x-instance-token` header.

```json
{ "instanceId": "abc123" }
```

Returns `{ token: string }`.

### GET /services

List all registered service names.

### GET /services/:serviceName

List all instances for a service.

### GET /services/:serviceName/:instanceId

Get a specific instance by ID.

## Technology

| Layer      |                                                              |
| ---------- | ------------------------------------------------------------ |
| Runtime    | Node.js                                                      |
| Language   | TypeScript (ES2020, module: node16)                          |
| Framework  | Express 5                                                    |
| Security   | mTLS (via `createSecureServer` from `@trading-model/common`) |
| Validation | Zod (via `BaseEnvSchema` from `@trading-model/common`)       |
| Bootstrap  | `createBootstrap` from `@trading-model/common`               |
| Testing    | Jest + ts-jest                                               |
| Linting    | ESLint 10 flat config (root)                                 |

## Dependencies

- `@trading-model/common` — server factories, env validation, logger, middleware, crypto, types
