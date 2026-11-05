# DLQ Service

**Package:** `dlq-service` (v2.0.0)
**Path:** `services/dlq-service/`

## Role

Stores and manages dead letter entries — messages that could not be delivered after exhausting retry attempts. Provides replay capability to re-inject entries into the message bus.

## Dependencies

| Dependency                          | Type          |
| ----------------------------------- | ------------- |
| `@trading-model/common`             | runtime       |
| `@trading-model/address-manager`    | runtime       |
| MongoDB                             | persistence   |
| Redis                               | rate limiting |

## Endpoints

All endpoints are mTLS-secured and served on **container port 3000**:

| Method   | Path            | Description                                                      |
| -------- | --------------- | ---------------------------------------------------------------- |
| `POST`   | `/dlq`          | Store a new dead letter entry (`DlqEntryWire`, `@trading-model/validation/wire/dlq-entry`) |
| `GET`    | `/dlq`          | List dead letter entries (query `topic`, `limit` 1–1000, `offset` or `cursor`) |
| `DELETE` | `/dlq`          | Delete entries by id (body `{ "ids": [...] }`, 1 to 1000 ids)    |
| `POST`   | `/dlq/replay`   | Replay entries to message-manager (query `topic`, `limit`, `batchId`) |
| `GET`    | `/health`       | Health check                                                     |
| `GET`    | `/health/ready` | Readiness (dependencies)                                         |

The `/dlq` routes also require a signed request: `x-service-name` (one of
`DLQ_ALLOWED_SERVICES`), `x-timestamp` (ms, at most 5 minutes old) and
`x-signature` (HMAC with `DLQ_AUTH_HMAC_SECRET`, see
`@trading-model/crypto` `request-signer`). The signed path is the request
path with its query string, as sent (`/dlq/replay?topic=x&limit=50`): a
signature is valid for that query only. The gateway API key alone is not
enough.

The request and response schemas of the `/dlq` routes are declared in
`src/adapters/inbound/api-routes.ts` (`DLQ_API`, ADR-0021) and published in the
[OpenAPI](openapi/api-gateway.yaml). Invalid input gets a 400
`{ "error": "Validation failed", "details": [{ "field": "body.timestamp", "message": "..." }] }`.
`timestamp` is epoch milliseconds; ISO dates and epoch strings are still accepted.

## Examples

> mTLS uses the service SVID (SPIRE). Run these inside the service container,
> e.g. `docker compose exec -T dlq-service sh -c 'curl ...'`.

```bash
# Health check (no signature needed)
curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem   https://localhost:3000/health

# Signed routes: SIGNED_HEADERS holds the x-service-name, x-timestamp and
# x-signature headers computed for this method and path (query included).
curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem   $SIGNED_HEADERS https://localhost:3000/dlq

# Replay up to 50 entries of one topic
curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem   $SIGNED_HEADERS -X POST   'https://localhost:3000/dlq/replay?topic=market.trade.recent.fetch&limit=50'

# Delete entries by id
curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem   $SIGNED_HEADERS -X DELETE https://localhost:3000/dlq   -H 'Content-Type: application/json'   -d '{"ids":["entry-uuid-123"]}'
```

## Environment Variables

See [Environment Variables](../../deployment/ENV.md#dlq-service).

## Audit trail

dlq-service publishes each step on the bus, where audit-logger records it like every topic: `dlq.entry.added` (`entryId`, `topic`, `reason`), `dlq.replay.completed` (`batchId`, `topic`, `replayed`, `failed`) and `dlq.entries.deleted` (`ids`, `deleted`). It does not wait for these publishes (message-manager answers once audit-logger took the event or gave up) and only logs a warning when one fails. A dead letter of a `dlq.*` event publishes nothing: while audit-logger is down each would dead-letter the next.

Until 2026-10-30 these notifications were a `POST` to an `/audit` route audit-logger never had: none was ever recorded.

## Limitations

- Maximum stored entries is configurable via `MAX_ENTRIES` (default: 100,000)
- Replay delivers back to message-manager with original payload headers intact. message-manager stamps a new `messageId` on each publish, so a replay is never re-sent once it left: it waits for message-manager's answer (`PUBLISH_TIMEOUT_MS` + 5 s), and a claim is released as stale only after `STALE_CLAIM_MS` (about 8 min, see ADR-0019). At shutdown, claims of replays still in flight stay until then
- A `POST /dlq/replay` lasts as long as message-manager takes to deliver the batch (up to the 2 min batch timeout plus one delivery): a caller with a shorter timeout gets an error while the replay goes on
