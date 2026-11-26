# @trading-model/broker-message — Message Bus

Message bus library: publish to and consume from the Redis Streams journal, in process (ADR-0073).

## Overview

**@trading-model/broker-message** is the inter-service messaging SDK for the platform. It provides topic-based publish/consume over the Redis Streams journal (one stream per topic, one consumer group per service, dead streams), a fluent metadata builder, and Zod-based schema validation for all message payloads.

Every microservice uses this package to send and receive typed, validated messages through the bus; no broker service sits in between.

## Bus library (`src/bus/`)

`busJournalFromEnv(env)` (`@trading-model/broker-message/create-message-manager`) returns a `RedisMessageJournal` and throws without Redis settings (`REDIS_URL` or `REDIS_SENTINELS`, `REDIS_SENTINEL_MASTER_NAME`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_SENTINEL_PASSWORD`, `REDIS_TLS_MODE`, `REDIS_TLS_CA`, `REDIS_TLS_SERVERNAME`, plus `JOURNAL_MIN_REPLICAS`). `createServiceBusClient` passes it to `BusClient`. Keys keep the prefix `trading-model:message-manager`.

| Export (`@trading-model/broker-message/bus/…`) | Role |
| ---------------------------------------------- | ---- |
| `publisher` — `publishToBus` | `XADD` into the topic stream; rejects when Redis refuses the write or when `delivery.requireSubscriber` is set and nobody subscribes |
| `consumer` — `BusConsumer` | One loop per topic, `XREADGROUP` + `XCLAIM` retries, `XACK` on success; one consumer group per subscriber service |
| `redis-journal`, `journal.port` | Journal over Redis Streams (`RedisMessageJournal`, `MessageJournalPort`) |
| `dead-streams` — `DeadStreams` | Entries over the delivery limit (10 for `at-least-once`) expired TTL, failed `exactly-once` attempt, or rejected with a `DeadLetterError` are copied to `trading-model:message-manager:dead:<topic>`, entries older than 7 days trimmed on each new dead letter (`DEAD_LETTER_RETENTION_MS`) |
| `metrics` | `mm_messages_delivered_total`, `mm_messages_dlq_total`, `mm_journal_*`, `bus_dead_letters`, `bus_publisher_rejected_total` |
| `backoff`, `delivery-error-classifier`, `delivery-metadata-extractor`, `message-factory` | Retry delay, error classification, delivery metadata, message construction |

Dead letters are read, replayed and deleted with the `audit-dlq` CLI of audit-logger (`dlq-cli.js <operator> list|replay|delete`), see [runbook-message-bus-outage](../operations/runbooks/runbook-message-bus-outage.md). Replicas of a service share the group: one of them gets each entry, never both.

## Dependencies

- `@trading-model/http` — HttpClient, middleware (`catchSync`, `ResponseException`)
- `@trading-model/primitives` — branded messaging/service types
- `@trading-model/contracts` — message envelope contracts (`message.types`)
- `@trading-model/common` — error classes, config re-exports (`event.types`, `services.types`, `tls-paths`)
- `@trading-model/persistence` — Redis connection and the journal client
- `express` — Express `Router`, `Application` types
- `zod` — Runtime schema validation for metadata and payloads

## Main Class

- **Import**: `@trading-model/broker-message`
- **Default export**: class `BusClient`

```ts
import BusClient from '@trading-model/broker-message';
```

### Constructor

```ts
constructor({
  journal,        // RedisMessageJournal; `busJournalFromEnv(env)` builds it from REDIS_URL / REDIS_SENTINELS and throws without them
  instanceId,
  serviceName,
}: {
  journal: RedisMessageJournal;
  instanceId: InstanceId;
  serviceName: ServiceInstanceName;
})
```

> Prefer `createServiceBusClient(env)` (`@trading-model/broker-message/create-message-manager`), which reads `INSTANCE_ID`, `SERVICE_NAME` and the Redis settings from the service env.

### Public Methods

| Method                          | Description                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `subscribe(topics, handle)`     | Consumes the topics in this process; each message is schema-checked, deduplicated by `messageId`, then passed to `handle`. A throw retries, then dead-letters |
| `stop()`          | Stops the consumer loops                                                                             |
| `publish(payload, meta)`  | Publishes with an `XADD`; resolves once the entry is durable                                         |

### Publishing

```ts
await broker.publish(payload, metadata);
```

## MetadataBuilder

Fluent builder for message metadata.

- **Import**: `@trading-model/broker-message`
- **Access**: `HELPER.metadataBuilder`

```ts
import BusClient, { HELPER } from '@trading-model/broker-message';

const metadata = new HELPER.metadataBuilder('training.model.published', 'training.model.published', publisher)
  .setDelivery({ mode: 'at-least-once' })
  .toJSON();
```

| Method                                     | Description                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `setDelivery(context)`                     | Sets delivery mode (mode, ttl)                                                     |
| `setIds({ causationId?, correlationId? })` | Sets correlation IDs                                                                                |
| `toJSON()`                                 | Produces the `MessageMetadata` object. Throws `MetadataBuilderError` if required fields are missing |

## Zod Schemas

- **Import**: `@trading-model/broker-message/shared/barrel/message.schema`

| Schema                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `MessageMetadataSchema` | Full metadata validation                       |
| `MessagePayloadSchema`  | Discriminated payload validation by event type |

Supported event validators: `exampleEvent`, `testEvent`, `fetchRecentTrades`, `fetch24hrTickerStats`, `fetchCandlestickSeries`, `fetchOrderBookSnapshot`, `fetchPriceTickerSnapshot`, `fetchOrderBookTickerSnapshot`.

## Key Interfaces

```ts
interface ServiceIdentity {
  serviceName: ServiceInstanceName;
  instanceId: string;
  region?: string;
}

interface RoutingType {
  partitionKey?: string;
  priority?: number;
}

interface DeliveryType {
  mode: DeliveryModeEnum;
  ttl?: number;
}

interface SecurityType {
  authContext?: { subject: string; roles: string[]; tenantId: string };
  signature?: string;
}

interface MessageMetadata {
  messageId?: string;
  correlationId?: string;
  schemaVersion: string;
  causationId?: string;
  eventType: string;
  emittedAt?: Date;
  topic: string;
  publisher: ServiceIdentity;
  routing?: RoutingType;
  delivery?: DeliveryType;
  security?: SecurityType;
  traceparent?: string; // W3C trace context of the publish, set by the client (ADR-0048)
}

interface Message<T = unknown> {
  metadata: MessageMetadata;
  payload: T;
}
```

## Usage Example

```typescript
import BusClient, { HELPER } from '@trading-model/broker-message';
import { busJournalFromEnv } from '@trading-model/broker-message/create-message-manager';

const broker = new BusClient({
  journal: busJournalFromEnv(ENV),
  instanceId: 'instance-1',
  serviceName: 'audit-logger',
});

await broker.subscribe(['training.model.published'], async ({ metadata, payload }) => {
  console.log(metadata.topic, payload);
});

const metadata = new HELPER.metadataBuilder('training.model.published', 'training.model.published', publisher).toJSON();

await broker.publish({ price: 50000 }, metadata);
await broker.stop();
```

Dead letters wait in the dead stream of their topic; the audit-logger `dlq-cli` lists, replays and deletes them.
