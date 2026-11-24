# @trading-model/broker-message — Message Bus

Inter-service messaging library: the Redis Streams bus used in process ([ADR-0073](../adr/0073-message-bus-as-a-redis-streams-library.md)), plus the HTTP client of **message-manager** until release N+1.

## Overview

**@trading-model/broker-message** publishes and consumes typed, validated messages. Since ADR-0073 (release N) a service that sets its `REDIS_*` variables talks to the bus directly in Redis; without them it keeps the HTTP path through message-manager. Both paths share the same streams and consumer groups. It also provides an in-process event emitter, a fluent metadata builder and Zod schemas for all payloads.

## Bus library (`src/bus/`)

Opt-in: `busJournalFromEnv(env)` (`@trading-model/broker-message/create-message-manager`) follows `BUS_TRANSPORT`: `library` returns a `RedisMessageJournal` and throws without Redis settings, `http` returns `undefined`; unset, it returns the journal only when a Redis setting is present (`REDIS_URL` or `REDIS_SENTINELS`, `REDIS_SENTINEL_MASTER_NAME`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_SENTINEL_PASSWORD`, `REDIS_TLS_MODE`, `REDIS_TLS_CA`, `REDIS_TLS_SERVERNAME`, plus `JOURNAL_MIN_REPLICAS`). `createServiceMessageManager` passes it to `BrokerMessage`. Keys keep the prefix `trading-model:message-manager`.

| Export (`@trading-model/broker-message/bus/…`) | Role |
| ---------------------------------------------- | ---- |
| `publisher` — `publishToBus` | `XADD` into the topic stream; rejects when Redis refuses the write or when `delivery.requireSubscriber` is set and nobody subscribes |
| `consumer` — `BusConsumer` | One loop per topic, `XREADGROUP` + `XCLAIM` retries, `XACK` on success; one consumer group per subscriber service |
| `redis-journal`, `journal.port` | Journal over Redis Streams (`RedisMessageJournal`, `MessageJournalPort`) |
| `dead-streams` — `DeadStreams` | Entries over the delivery limit (10 for `at-least-once`) expired TTL, failed `exactly-once` attempt, or rejected with a `DeadLetterError` are copied to `trading-model:message-manager:dead:<topic>`, entries older than 7 days trimmed on each new dead letter (`DEAD_LETTER_RETENTION_MS`) |
| `metrics` | `mm_messages_delivered_total`, `mm_messages_dlq_total`, `mm_journal_*`, `bus_dead_letters`, `bus_publisher_rejected_total` |
| `backoff`, `delivery-error-classifier`, `delivery-metadata-extractor`, `message-factory` | Retry delay, error classification, delivery metadata, message construction |

Dead letters are read, replayed and deleted with the `audit-dlq` CLI of audit-logger (`dlq-cli.js <operator> list|replay|delete`), see [runbook-dlq-backlog](../operations/runbooks/runbook-dlq-backlog.md). Replicas of a service share the group: one of them gets each entry, message-manager's workers included, never both.

## Dependencies

- `@trading-model/http` — HttpClient, middleware (`catchSync`, `ResponseException`)
- `@trading-model/primitives` — branded messaging/service types
- `@trading-model/contracts` — message envelope contracts (`message.types`)
- `@trading-model/common` — error classes, config re-exports (`event.types`, `services.types`, `tls-paths`)
- `@trading-model/address-manager` — Service discovery (finds message-manager)
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
  addressManagerClient,
  tlsPaths,
  callbackPath,
  instanceId,
  serviceName,
}: {
  instanceId: InstanceId;
  callbackPath: string;    // default: 'message'
  tlsPaths: TlsPaths;      // { key, cert, ca } — SVID files written by spiffe-helper (ADR-0011)
  addressManagerClient: addressManagerClient;
  serviceName: ServiceInstanceName;
})
```

> Prefer the `createServiceMessageManager(addressManagerClient, env)` factory, which builds `tlsPaths` from the service env (`TLS_CERT_PATH`, `TLS_KEY_PATH`, `TLS_CA_PATH`) and reads `INSTANCE_ID`, `SERVICE_NAME`, `MESSAGE_CALLBACK_PATH`.

### Public Methods

| Method                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `intents(topics)`      | Subscribes to a list of topics (`EventEnumMap[]`)    |
| `stopMessageManager()` | Unsubscribes from all topics and cleans up listeners |
| `on(event, listener)`  | Registers a listener for a broker event              |

### Publishing

```ts
const message = new BrokerMessage({...});

// Indirect send via the broker (async pub/sub)
await message.post.indirect(payload, metadata);
```

## HTTP client of message-manager (to be removed with [#1241](https://github.com/docteur-turboss/trading-model/issues/1241))

Served: none (each subscriber mounts its own `POST /message` route). Calls made to message-manager:

| Method | Path                              | Source                                      | Purpose                                |
| ------ | --------------------------------- | ------------------------------------------- | -------------------------------------- |
| POST   | `https://{host}:{port}/subscribe` | `MessageManagerClient.subscribeToTopics`    | Subscribe to a topic                   |
| DELETE | `https://{host}:{port}/subscribe` | `MessageManagerClient.unSubscribeToTopic`   | Unsubscribe from a topic               |
| POST   | `https://{host}:{port}/message`   | `MessageManagerClient.publishAsyncMessage`  | Publish an asynchronous message        |

### MessageManagerClient

Internal HTTP client communicating with the message-manager.

- **Import**: `@trading-model/broker-message/message-manager-client`

```ts
class MessageManagerClient {
  constructor(httpClient, config: MessageManagerConfig, addressManagerClient);

  subscribeToTopics(topics: EventEnumMap[]): Promise<void>;
  unSubscribeToTopic(topics: EventEnumMap[]): Promise<void>;
  publishAsyncMessage<T>(payload: T, metadata: MessageMetadata): Promise<void>;
}
```

#### MessageManagerConfig

```ts
type MessageManagerConfig = {
  serviceName: ServiceInstanceName;
  callbackPath: string;
  instanceId: string;
};
```

## MetadataBuilder

Fluent builder for message metadata.

- **Import**: `@trading-model/broker-message`
- **Access**: `HELPER.metadataBuilder`

```ts
import BrokerMessage, { HELPER } from '@trading-model/broker-message';

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

## EventManager

Typed EventEmitter for local broker event handling.

- **Import**: `@trading-model/broker-message/event-manager-client`

```ts
EVENT_MANAGER.on(eventName, callback); // returns a cleanup function
EVENT_MANAGER.emit(eventName, data);
```

```ts
import { EVENT_MANAGER } from '@trading-model/broker-message';

EVENT_MANAGER.on('training.model.published', data => {
  console.log(data.trades);
});
```

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
import AddressManager from '@trading-model/address-manager';

const am = new AddressManager({/* config */});
const { stop: stopAM } = am.start();

const broker = new BrokerMessage({
  instanceId: 'instance-1',
  serviceName: 'trader-trainer',
  tlsPaths: {
    ca: '/var/run/secrets/spiffe/bundle.pem',
    cert: '/var/run/secrets/spiffe/svid.pem',
    key: '/var/run/secrets/spiffe/svid_key.pem',
  },
  addressManagerClient: am,
});

await broker.intents(['training.model.published', 'dlq.entry.added']);

const cleanup = broker.on('training.model.published', data => {
  console.log('Received trades:', data.trades);
});

const metadata = new HELPER.metadataBuilder('training.model.published', 'training.model.published', publisher).toJSON();

await broker.post.indirect({ price: 50000 }, metadata);

cleanup();
await broker.stopMessageManager();
stopAM();
```
