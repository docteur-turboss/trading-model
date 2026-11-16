# @trading-model/broker-message — Message Bus

Message bus library: publish to and consume from the Redis Streams journal, in process (ADR-0073).

## Overview

**@trading-model/broker-message** is the inter-service messaging SDK for the platform. It provides topic-based publish/consume over the Redis Streams journal (one stream per topic, one consumer group per service, dead streams), a fluent metadata builder, and Zod-based schema validation for all message payloads.

Every microservice uses this package to send and receive typed, validated messages through the bus; no broker service sits in between.

## Dependencies

- `@trading-model/http` — HttpClient, middleware (`catchSync`, `ResponseException`)
- `@trading-model/primitives` — branded messaging/service types
- `@trading-model/validation` — message envelope contracts (`message.types`)
- `@trading-model/common` — error classes, config re-exports (`event.types`, `services.types`, `tls-paths`)
- `@trading-model/persistence` — Redis connection and the journal client
- `express` — Express `Router`, `Application` types
- `zod` — Runtime schema validation for metadata and payloads

## Main Class

- **Import**: `@trading-model/broker-message`
- **Default export**: class `BrokerMessage`

```ts
import BrokerMessage from '@trading-model/broker-message';
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

> Prefer `createServiceMessageManager(env)` (`@trading-model/broker-message/create-message-manager`), which reads `INSTANCE_ID`, `SERVICE_NAME` and the Redis settings from the service env.

### Public Methods

| Method                          | Description                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `intents(topics, handle)`       | Consumes the topics in this process; each message is schema-checked, deduplicated by `messageId`, then passed to `handle`. A throw retries, then dead-letters |
| `stopMessageManager()`          | Stops the consumer loops                                                                             |
| `post.indirect(payload, meta)`  | Publishes with an `XADD`; resolves once the entry is durable                                         |

### Publishing

```ts
await broker.post.indirect(payload, metadata);
```

## MetadataBuilder

Fluent builder for message metadata.

- **Import**: `@trading-model/broker-message`
- **Access**: `HELPER.metadataBuilder`

```ts
import BrokerMessage, { HELPER } from '@trading-model/broker-message';

const metadata = new HELPER.metadataBuilder()
  .setTopic('market.trade.recent.fetch')
  .setEventType('market.trade.recent.fetch')
  .setDelivery({ mode: 'at-least-once' })
  .toJSON();
```

| Method                                     | Description                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `setTopic(topic)`                          | Sets the topic (`bounded-context.aggregate.action` format)                                          |
| `setEventType(event)`                      | Sets the event type                                                                                 |
| `setDelivery(context)`                     | Sets delivery mode (mode, ttl)                                                     |
| `setSecurity(context)`                     | Sets security context (authContext, signature)                                                      |
| `setIds({ causationId?, correlationId? })` | Sets correlation IDs                                                                                |
| `toJSON()`                                 | Produces the `MessageMetadata` object. Throws `MetadataBuilderError` if required fields are missing |
| ------------------------------------------ | ----------------------------------------------------------                                          |

> **Note on required fields**: `topic`, `eventType`, and `publisher` must be set before calling `toJSON()`, otherwise a `MetadataBuilderError` is thrown. Previously, unset fields were tracked via the sentinel string `'null'`, which was indistinguishable from a legitimate value — this has been replaced with proper `undefined`-based tracking.

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
import BrokerMessage, { HELPER } from '@trading-model/broker-message';
import { busJournalFromEnv } from '@trading-model/broker-message/create-message-manager';

const broker = new BrokerMessage({
  journal: busJournalFromEnv(ENV),
  instanceId: 'instance-1',
  serviceName: 'audit-logger',
});

await broker.intents(['market.trade.recent.fetch'], async ({ metadata, payload }) => {
  console.log(metadata.topic, payload);
});

const metadata = new HELPER.metadataBuilder()
  .setTopic('market.trade.executed')
  .setEventType('trade.executed')
  .toJSON();

await broker.post.indirect({ price: 50000 }, metadata);
await broker.stopMessageManager();
```

Dead letters wait in the dead stream of their topic; the audit-logger `dlq-cli` lists, replays and deletes them.

## Deployment

This package is built as a workspace dependency. Consuming services reference it in their `package.json`:

```json
"dependencies": { "@trading-model/broker-message": "*" }
```

Build: `bun run build` (tsc, Node16 module output). The compiled output goes to `dist/`.
