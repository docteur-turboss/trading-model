# ADR-0053: Keyset Pagination of the Public Market Data Reads, Capped Proxied Answers

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) (Zod schemas, generated OpenAPI), [ADR-0036](./0036-multi-dimension-signals-mvp.md) (the `signals` route: window, `truncated`), [ADR-0013](./0013-config-gated-dead-code-removal.md) (a new env var, `config:check`)
**Verified by:** `services/financial-scraper/tests/unit/clients/http/api-routes.spec.ts`, `services/financial-scraper/tests/unit/infra/market-data/schema/trades.schema.spec.ts`, `services/financial-scraper/tests/unit/infra/market-data/schema/ticker24h.schema.spec.ts`, `services/financial-scraper/tests/unit/infra/market-data/schema/candles-schema.spec.ts`, `services/financial-scraper/tests/db/market-data.db.spec.ts`, `services/api-gateway/tests/unit/proxy-handler.spec.ts`, `services/api-gateway/tests/unit/proxy-dispatcher.spec.ts`, `bun run api:check`, `bun run config:check`

## Context

The 9 public reads of financial-scraper (`trade`, `ticker`, `candles` × `sources/:source`, `symbols/:symbol`, `timestamp/:timestamp`, all in `PUBLIC_ROUTES`) ran a `SELECT` with neither `LIMIT` nor `ORDER BY` and answered the whole result as one JSON array. The tables only grow (about 288 000 trades a day, kept 1 827 days): one authenticated request under the rate limit could exhaust the scraper (512 Mi) and then the gateway (256 Mi), which buffers, parses and re-serializes every upstream answer (issue #552). Only `signals` was bounded (`MAX_SIGNALS_PER_ANSWER`). No internal service reads these routes. The owner chose options A3 + B1 of the issue.

## Decision

1. **Keyset pages on the 9 table routes.** Query `limit` (1 to 5 000, default 500), `after` (opaque cursor), `from` / `to` (ISO dates, optional, `[from, to)`, `from < to`), validated by Zod in `api-routes.ts`. Rows come in (`timestamp`, `id`) order: `id` is the `AUTO_INCREMENT` column every market data table has, so ties on `timestamp` have a stable order. The query is `WHERE <route filter> [AND window] [AND (timestamp > ? OR (timestamp = ? AND id > ?))] ORDER BY timestamp, id LIMIT limit + 1`: the extra row tells whether rows are left.
2. **Answer shape.** `{ rows, nextCursor, truncated }`: `nextCursor` is the key of the last row (base64url of `<epoch ms>.<id>`, opaque to clients) or `null` on the last page; `truncated` is `nextCursor !== null`, the field name `signals` already uses. `id` stays internal: it is not in the rows. The bound comes from `limit` alone, so no request can read more than 5 001 rows, window or not.
3. **Order books** (in-memory snapshots, not table rows): `limit` only, answer `{ rows, truncated }`, no cursor. Their storage is issue #554.
4. **Gateway cap.** `forwardRequest` counts the upstream bytes; past `PROXY_MAX_RESPONSE_BYTES` (default 8 MiB) it destroys the upstream answer and the gateway answers **502** `{ "error": "Upstream response too large" }` (nothing cached). With the routes bounded this is a safety net, not a code path clients should meet. Streaming large answers (option B2) was not chosen: it would bypass the response cache and `sendResponse` for answers that should no longer exist.

## Consequences

- Breaking change of the public contract: the 13 routes answer an object instead of an array, and a client that read "everything" now reads 500 rows unless it follows `nextCursor`. The OpenAPI (`docs/services/openapi/api-gateway.yaml`) is regenerated from the schemas.
- The `ORDER BY timestamp, id` is only cheap with a usable index: until the `timestamp` indexes are visible (issue #555), MySQL sorts the rows of the filter before applying `LIMIT` (bounded memory, but a scan). The answer size is bounded either way.
- An upstream answer larger than the cap is lost for the client (502); raising `PROXY_MAX_RESPONSE_BYTES` costs gateway memory (several times the answer size).
- A new paged public read follows this convention (`limit` / `after` / `nextCursor` / `truncated`).
