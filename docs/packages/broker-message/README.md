# @trading-model/broker-message

## Overview

**@trading-model/broker-message** is the inter-service messaging SDK for the platform. It provides topic-based publish/subscribe over HTTP, an in-process event emitter for local message dispatch, a fluent metadata builder, and Zod-based schema validation for all message payloads.

Every microservice uses this package to send and receive typed, validated messages through the Message Delivery Service.

## Dependencies

- `@trading-model/common` — HttpClient, event types, service types, error classes
- `@trading-model/address-manager` — Service discovery (finds Message Delivery Service)
- `express` — Express `Router`, `Application` types
- `zod` — Runtime schema validation for metadata and payloads

## Endpoints

### Served (Inbound)

Mounted via `broker.listenExpress(app)`:

| Method | Path | Handler | Description |
|---|---|---|---|
| POST | `/{callbackPath}` (default: `/message`) | `MessageController` | Receives incoming broker messages, validates metadata + payload, emits event locally |

### Consumed (Outbound)

Calls made to the Message Delivery Service:

| Method | Path | Source | Purpose |
|---|---|---|---|
| POST | `https://{host}:{port}/subscribe` | `MessageManagerClient.SubscribeToTopics` | Subscribe to a topic |
| DELETE | `https://{host}:{port}/subscribe` | `MessageManagerClient.UnSubscribeToTopic` | Unsubscribe from a topic |
| POST | `https://{host}:{port}/message` | `MessageManagerClient.publishAsyncMessage` | Publish an asynchronous message |
| POST | `https://{host}:{port}/message` | `MessageManagerClient.publishDirectMessage` | Publish directly to a specific service |

## Exports

### Default Export — Broker-Message Client Class

```typescript
import BrokerMessage from "@trading-model/broker-message";

const broker = new BrokerMessage({
  instanceId: string;
  serviceName: keyof typeof ServiceInstanceName;
  RootCACertPath: string;
  CertificatPath: string;
  KeyCertificatPath: string;
  addressManagerClient: AddressManager;
  callbackPath?: string;       // default: "message"
});
```

**Methods:**

| Method | Signature | Description |
|---|---|---|
| `broker.intents(topics)` | `(topics: EventEnumMap[]) => Promise<void>` | Subscribe to event topics via Message Delivery Service |
| `broker.stopMessageManager()` | `() => Promise<void>` | Unsubscribe from all topics, remove all event listeners |
| `broker.on(event, listener)` | `(event, listener) => () => void` | Register local event listener, returns cleanup function |
| `broker.listenExpress(app)` | `(app: Application) => void` | Mount the callback POST route on Express app |

**Static Properties:**

| Property | Signature | Description |
|---|---|---|
| `broker.post.direct(service, payload, metadata)` | `<T>(service, payload, metadata) => Promise<void>` | Publish message directly to a specific service |
| `broker.post.indirect(payload, metadata)` | `<T>(payload, metadata) => Promise<void>` | Publish message asynchronously via delivery service |

### Named Export — `helper`

```typescript
import { helper } from "@trading-model/broker-message";
// helper.MetadataBuilder — fluent MessageMetadata builder
```

| Export | Description |
|---|---|
| `helper.MetadataBuilder` | `MessageMetadata` class (see below) |

### Internal Types & Classes

#### Types (`shared/types/`)

| Export | Kind | Description |
|---|---|---|
| `MessageManagerConfig` | type | `{ serviceName, callbackPath, instanceId }` |
| `IdentifyType` | interface | `{ serviceName, instanceId }` — publisher/subscriber identity |
| `RoutingType` | interface | `{ partitionKey?, priority? }` — routing hints |
| `DeliveryType` | interface | `{ mode: DeliveryModeEnum, ttl?, deduplicationId? }` — delivery semantics |
| `SecurityType` | interface | `{ authContext?, signature? }` — auth context and message signature |
| `BrokerConfig` | interface | TLS certificate paths for broker connections |
| `message<T>` | interface | Canonical message envelope: `{ metadata, payload }` |
| `MessageMetadata` | interface | Full metadata structure: `correlationId, schemaVersion, causationId, eventType, topic, publisher, routing, delivery, security` |
| `SubscribesTopicsPayload` | type | `{ topic, callbackPath, consumerIdentity }` |
| `UnSubscribesTopicsPayload` | type | `{ topic, instanceId }` |

#### MessageMetadata Builder (`shared/helper/messages/message.ts`)

Fluent builder class for constructing `MessageMetadata`:

```typescript
const metadata = new MessageMetadata()
  .setTopic("market.trade.executed")
  .setEventType("trade.executed")
  .setPublisher({ serviceName: "TraderTrainingService", instanceId: "node-1" })
  .setSecurity({ authContext: { subject: "svc-acct", roles: [], tenantId: "main" } })
  .setDelivery({ mode: "at-least-once", ttl: 60000 })
  .setRouting({ partitionKey: "trade-123", priority: 1 })
  .setIds({ correlationId: uuid, causationId: uuid })
  .setSchemaVersion("1.0.0")
  .toJSON();
```

#### Zod Schemas (`shared/helper/messages/message.schema.ts`)

| Export | Description |
|---|---|
| `MessageMetadataSchema` | Zod schema for all metadata fields with format validation |
| `MessagePayloadSchema` | Discriminated union validating payloads by event type |
| `MessagePayload` | Inferred TypeScript type from schema |

Supported event validators: `exampleEvent`, `testEvent`, `fetchRecentTrades`, `fetch24hrTickerStats`, `fetchCandlestickSeries`, `fetchOrderBookSnapshot`, `fetchPriceTickerSnapshot`, `fetchOrderBookTickerSnapshot`.

#### EventManager (`client/eventManagerClient.ts`)

Global singleton in-process event emitter:

```typescript
import { EventManager } from "@trading-model/broker-message";

EventManager.on("market.trade.recent.fetch", (data) => {
  console.log(data.trades);
});
```

| Method | Signature | Description |
|---|---|---|
| `on(event, callback)` | `(event, callback) => () => void` | Register listener, returns cleanup |
| `off(event, callback)` | `(event, callback) => void` | Remove listener |
| `emit(event, ...args)` | `(event, ...args) => void` | Emit event to all registered listeners |
| `removeAllListeners()` | `() => void` | Clear all listeners |

## How to Use

### Basic Setup

```typescript
import BrokerMessage from "@trading-model/broker-message";
import AddressManager from "@trading-model/address-manager";
import express from "express";

const app = express();
app.use(express.json());

const am = new AddressManager({ /* config */ });
const { stop: stopAM } = am.start();

const broker = new BrokerMessage({
  instanceId: "instance-1",
  serviceName: "TraderTrainingService",
  RootCACertPath: "/etc/certs/ca.pem",
  CertificatPath: "/etc/certs/cert.pem",
  KeyCertificatPath: "/etc/certs/key.pem",
  addressManagerClient: am,
});

// Mount the callback route
broker.listenExpress(app);

// Subscribe to topics
await broker.intents(["market.trade.recent.fetch", "market.ticker.24hr-stats.fetch"]);

// Handle incoming messages locally
const cleanup = broker.on("market.trade.recent.fetch", (data) => {
  console.log("Received trades:", data.trades);
});

// Publish a message directly to another service
const metadata = new MessageMetadata()
  .setTopic("market.trade.executed")
  .setEventType("trade.executed")
  .setPublisher({ serviceName: "TraderTrainingService", instanceId: "node-1" })
  .toJSON();

await broker.post.direct("FinancialScrapperService", { symbol: "BTCUSDT" }, metadata);

// Publish asynchronously
await broker.post.indirect({ price: 50000 }, metadata);

// Cleanup
cleanup();
await broker.stopMessageManager();
stopAM();
```

### Lifecycle

1. **Constructor**: Creates HttpClient (mTLS), MessageManagerClient, sets up callback path
2. **`broker.intents(topics)`**: Discovers Message Delivery Service via address-manager, subscribes to each topic
3. **`broker.listenExpress(app)`**: Mounts `POST /{callbackPath}` route for receiving messages
4. On incoming POST: validates metadata + payload via Zod, emits validated event via `EventManager`
5. **`broker.post.direct`**: Discovers target service, sends message directly
6. **`broker.post.indirect`**: Discovers Message Delivery Service, sends message for routing
7. **`broker.stopMessageManager()`**: Unsubscribes all topics, removes all event listeners

## Deployment

This package is built as a workspace dependency. Consuming services reference it in their `package.json`:

```json
"dependencies": { "@trading-model/broker-message": "*" }
```

Build: `npm run build` (tsc, Node16 module output). The compiled output goes to `dist/`.
