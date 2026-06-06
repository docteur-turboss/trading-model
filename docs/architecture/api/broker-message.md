# @trading-model/broker-message — Message Bus

Client SDK for interacting with the **message-manager** (pub/sub message broker).

## Overview

**@trading-model/broker-message** is the inter-service messaging SDK for the platform. It provides topic-based publish/subscribe over HTTP, an in-process event emitter for local message dispatch, a fluent metadata builder, and Zod-based schema validation for all message payloads.

Every microservice uses this package to send and receive typed, validated messages through the Message Delivery Service.

## Dependencies

- `@trading-model/common` — HttpClient, event types, service types, error classes
- `@trading-model/address-manager` — Service discovery (finds Message Delivery Service)
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
  KeyCertificatPath,
  RootCACertPath,
  CertificatPath,
  callbackPath?,
  instanceId,
  serviceName,
}: {
  instanceId: string;
  callbackPath?: string;   // default: 'message'
  RootCACertPath: string;
  CertificatPath: string;
  KeyCertificatPath: string;
  addressManagerClient: addressManagerClient;
  serviceName: ServiceInstanceName;
})
```

### Public Methods

| Method                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `intents(topics)`      | Subscribes to a list of topics (`EventEnumMap[]`)    |
| `stopMessageManager()` | Unsubscribes from all topics and cleans up listeners |
| `on(event, listener)`  | Registers a listener for a broker event              |
| `listenExpress(app)`   | Mounts the POST callback route on the Express app    |

### Publishing

```ts
const message = new BrokerMessage({...});

// Direct send to a specific service
await message.post.direct(ServiceInstanceName.TraderTrainingService, payload, metadata);

// Indirect send via the broker (async pub/sub)
await message.post.indirect(payload, metadata);
```

## Endpoints

### Served (Inbound)

Mounted via `broker.listenExpress(app)`:

| Method | Path                                    | Handler             | Description                                                                          |
| ------ | --------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| POST   | `/{callbackPath}` (default: `/message`) | `MessageController` | Receives incoming broker messages, validates metadata + payload, emits event locally |

### Consumed (Outbound)

Calls made to the Message Delivery Service:

| Method | Path                              | Source                                      | Purpose                                |
| ------ | --------------------------------- | ------------------------------------------- | -------------------------------------- |
| POST   | `https://{host}:{port}/subscribe` | `MessageManagerClient.SubscribeToTopics`    | Subscribe to a topic                   |
| DELETE | `https://{host}:{port}/subscribe` | `MessageManagerClient.UnSubscribeToTopic`   | Unsubscribe from a topic               |
| POST   | `https://{host}:{port}/message`   | `MessageManagerClient.publishAsyncMessage`  | Publish an asynchronous message        |
| POST   | `https://{host}:{port}/message`   | `MessageManagerClient.publishDirectMessage` | Publish directly to a specific service |

## MessageManagerClient

Internal HTTP client communicating with the message-manager.

- **Import**: `@trading-model/broker-message/client/message-manager-client`

```ts
class MessageManagerClient {
  constructor(httpClient, config: MessageManagerConfig, addressManagerClient);

  SubscribeToTopics(topics: EventEnumMap[]): Promise<void>;
  UnSubscribeToTopic(topics: EventEnumMap[]): Promise<void>;
  publishAsyncMessage<T>(payload: T, metadata: MessageMetadata): Promise<void>;
  publishDirectMessage<T>(
    service: ServiceInstanceName,
    payload: T,
    metadata: MessageMetadata
  ): Promise<void>;
}
```

### MessageManagerConfig

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
- **Access**: `helper.MetadataBuilder`

```ts
import BrokerMessage, { helper } from '@trading-model/broker-message';

const metadata = new helper.MetadataBuilder()
  .setTopic('market.trade.recent.fetch')
  .setEventType('market.trade.recent.fetch')
  .setPublisher({ serviceName: 'financial-scrapper-service', instanceId: 'uuid' })
  .setDelivery({ mode: 'at-least-once' })
  .toJSON();
```

| Method                                     | Description                                                |
| ------------------------------------------ | ---------------------------------------------------------- |
| `setTopic(topic)`                          | Sets the topic (`bounded-context.aggregate.action` format) |
| `setEventType(event)`                      | Sets the event type                                        |
| `setPublisher(context)`                    | Sets the publisher identity                                |
| `setDelivery(context)`                     | Sets delivery mode (mode, ttl, deduplicationId)            |
| `setRouting(context)`                      | Sets routing hints (partitionKey, priority)                |
| `setSecurity(context)`                     | Sets security context (authContext, signature)             |
| `setSchemaVersion(version)`                | Sets schema version (default: '1.0.0')                     |
| `setIds({ causationId?, correlationId? })` | Sets correlation IDs                                       |
| `toJSON()`                                 | Produces the `MessageMetadata` object                      |

## Zod Schemas

- **Import**: `@trading-model/broker-message/shared/helper/messages/message.schema`

| Schema                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `MessageMetadataSchema` | Full metadata validation                       |
| `MessagePayloadSchema`  | Discriminated payload validation by event type |

Supported event validators: `exampleEvent`, `testEvent`, `fetchRecentTrades`, `fetch24hrTickerStats`, `fetchCandlestickSeries`, `fetchOrderBookSnapshot`, `fetchPriceTickerSnapshot`, `fetchOrderBookTickerSnapshot`.

## EventManager

Typed EventEmitter for local broker event handling.

- **Import**: `@trading-model/broker-message/client/event-manager-client`

```ts
EventManager.on(eventName, callback); // returns a cleanup function
EventManager.off(eventName, callback);
EventManager.emit(eventName, data);
EventManager.removeAllListeners();
```

```ts
import { EventManager } from '@trading-model/broker-message';

EventManager.on('market.trade.recent.fetch', data => {
  console.log(data.trades);
});
```

## Key Interfaces

```ts
interface IdentifyType {
  serviceName: ServiceInstanceName;
  instanceId: string;
}

interface RoutingType {
  partitionKey?: string;
  priority?: number;
}

interface DeliveryType {
  mode: DeliveryModeEnum;
  ttl?: number;
  deduplicationId?: string;
}

interface SecurityType {
  authContext?: { subject: string; roles: string[]; tenantId: string };
  signature?: string;
}

interface MessageMetadata {
  correlationId?: string;
  schemaVersion: string;
  causationId?: string;
  eventType: string;
  topic: string;
  publisher: IdentifyType;
  routing?: RoutingType;
  delivery?: DeliveryType;
  security?: SecurityType;
}

interface message<T = unknown> {
  metadata: MessageMetadata;
  payload: T;
}
```

## Usage Example

```typescript
import BrokerMessage from '@trading-model/broker-message';
import AddressManager from '@trading-model/address-manager';
import express from 'express';

const app = express();
app.use(express.json());

const am = new AddressManager({
  /* config */
});
const { stop: stopAM } = am.start();

const broker = new BrokerMessage({
  instanceId: 'instance-1',
  serviceName: 'TraderTrainingService',
  RootCACertPath: '/etc/certs/ca.pem',
  CertificatPath: '/etc/certs/cert.pem',
  KeyCertificatPath: '/etc/certs/key.pem',
  addressManagerClient: am,
});

broker.listenExpress(app);
await broker.intents(['market.trade.recent.fetch', 'market.ticker.24hr-stats.fetch']);

const cleanup = broker.on('market.trade.recent.fetch', data => {
  console.log('Received trades:', data.trades);
});

const metadata = new helper.MetadataBuilder()
  .setTopic('market.trade.executed')
  .setEventType('trade.executed')
  .setPublisher({ serviceName: 'TraderTrainingService', instanceId: 'node-1' })
  .toJSON();

await broker.post.direct('FinancialScrapperService', { symbol: 'BTCUSDT' }, metadata);
await broker.post.indirect({ price: 50000 }, metadata);

cleanup();
await broker.stopMessageManager();
stopAM();
```

## Deployment

This package is built as a workspace dependency. Consuming services reference it in their `package.json`:

```json
"dependencies": { "@trading-model/broker-message": "*" }
```

Build: `npm run build` (tsc, Node16 module output). The compiled output goes to `dist/`.
