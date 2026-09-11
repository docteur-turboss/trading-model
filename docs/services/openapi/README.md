# OpenAPI Specifications

This directory contains OpenAPI 3.0 specifications for the trading-model platform.

## Current Status

| Specification      | Status       | Coverage                              |
| ------------------ | ------------ | ------------------------------------- |
| `api-gateway.yaml` | ✅ Published | External-facing routes (18 endpoints) |

## Approach

The source of truth for API contracts is **Zod schemas** defined in each service and package.
OpenAPI specs are maintained alongside the documentation to support:

- **Client generation** — auto-generate TypeScript/Java/Python clients from the spec
- **Contract testing** — validate that implementations match the spec
- **API documentation** — render interactive API docs (Swagger UI, Redoc)
- **Tooling** — Postman collections, API gateways, mock servers

## Generating from Zod

Each service defines its request/response schemas using Zod. To generate OpenAPI from Zod:

1. Use `zod-to-json-schema` to convert Zod schemas to JSON Schema
2. Wrap JSON Schemas in OpenAPI 3.0 paths/schemas structure
3. Validate with `@redocly/cli` or `swagger-cli`

Example conversion pattern:

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';
import { PublishSchema } from './broker.schema';

const jsonSchema = zodToJsonSchema(PublishSchema, 'PublishMessage');
// → JSON Schema → OpenAPI 3.0 Schema Object
```

## References

- [API Documentation Index](../README.md) — Markdown API docs for all services
- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.3)
- [Swagger Editor](https://editor.swagger.io) — Validate and preview OpenAPI specs
