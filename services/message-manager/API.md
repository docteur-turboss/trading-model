# Message Delivery Service — API Reference

All endpoints accept and return **JSON**. Responses follow the `ResponseProtocol` standard defined in `@trading-model/common`. All requests require **mTLS client certificates**.

## POST /message

Publish a message to a topic. The broker enriches the message with a `messageId` (UUID) and `emittedAt` timestamp before dispatching.

### Request Body

```json
{
  "payload": { "...": "..." },
  "metadata": {
    "schemaVersion": "1.0.0",
    "eventType": "trade.executed",
    "topic": "market.trade.executed",
    "publisher": {
      "serviceName": "TraderTrainingService",
      "instanceId": "node-1"
    },
    "correlationId": "uuid",
    "causationId": "uuid",
    "routing": {
      "partitionKey": "trade-123",
      "priority": 1
    },
    "delivery": {
      "mode": "at-least-once",
      "ttl": 60000,
      "deduplicationId": "uuid"
    },
    "security": {
      "authContext": { "subject": "svc-acct" },
      "signature": "base64-signature"
    }
  }
}
```

### Fields

| Field                               | Type                                                     | Required | Description                                         |
| ----------------------------------- | -------------------------------------------------------- | -------- | --------------------------------------------------- |
| `payload`                           | `unknown`                                                | **yes**  | Business data carried by the message                |
| `metadata.schemaVersion`            | `string`                                                 | **yes**  | Version of the payload schema                       |
| `metadata.eventType`                | `string`                                                 | **yes**  | Business event name (e.g. `trade.executed`)         |
| `metadata.topic`                    | `string`                                                 | **yes**  | Logical routing channel for dispatch                |
| `metadata.publisher.serviceName`    | `enum`                                                   | **yes**  | One of the registered service names                 |
| `metadata.publisher.instanceId`     | `string`                                                 | **yes**  | Unique instance identifier                          |
| `metadata.correlationId`            | `string`                                                 | no       | Correlates messages in the same flow                |
| `metadata.causationId`              | `string`                                                 | no       | ID of the message that caused this one              |
| `metadata.routing.partitionKey`     | `string`                                                 | no       | Ensures ordering for a business key                 |
| `metadata.routing.priority`         | `number`                                                 | no       | Delivery scheduling priority                        |
| `metadata.delivery.mode`            | `enum`                                                   | no       | `at-most-once` \| `at-least-once` \| `exactly-once` |
| `metadata.delivery.ttl`             | `number`                                                 | no       | Message expiration in milliseconds                  |
| `metadata.delivery.deduplicationId` | `string`                                                 | no       | Prevents duplicate processing                       |
| `metadata.security.authContext`     | `{ subject: string, roles: string[], tenantId: string }` | no       | Authentication / authorization context              |
| `metadata.security.signature`       | `string`                                                 | no       | Message integrity signature                         |

### Response

| Status              | Description                                     |
| ------------------- | ----------------------------------------------- |
| **204 No Content**  | Message published and dispatched to subscribers |
| **400 Bad Request** | Invalid payload (Zod validation failure)        |

Note: A 204 response means the message was accepted by the broker. Delivery to subscribers is asynchronous — individual failures are isolated and do not affect the publish response.

---

## POST /subscription

Register a service instance as a subscriber to a topic. Duplicate subscriptions from the same `instanceId` are silently ignored.

### Request Body

```json
{
  "topic": "market.trade.executed",
  "callbackPath": "message",
  "consumerIdentity": {
    "serviceName": "FinancialScraperService",
    "instanceId": "instance-1"
  }
}
```

### Fields

| Field                          | Type     | Required | Description                                                  |
| ------------------------------ | -------- | -------- | ------------------------------------------------------------ |
| `topic`                        | `string` | **yes**  | Topic to subscribe to                                        |
| `callbackPath`                 | `string` | **yes**  | Relative HTTP path for message delivery (default: `message`) |
| `consumerIdentity.serviceName` | `enum`   | **yes**  | One of the registered service names                          |
| `consumerIdentity.instanceId`  | `string` | **yes**  | Unique instance identifier                                   |

### Response

| Status              | Description                                   |
| ------------------- | --------------------------------------------- |
| **204 No Content**  | Subscription registered successfully          |
| **400 Bad Request** | Invalid request body (Zod validation failure) |

---

## DELETE /subscription

Unregister a service instance from a topic.

### Request Body

```json
{
  "topic": "market.trade.executed",
  "instanceId": "instance-1"
}
```

### Fields

| Field        | Type     | Required | Description                |
| ------------ | -------- | -------- | -------------------------- |
| `topic`      | `string` | **yes**  | Topic to unsubscribe from  |
| `instanceId` | `string` | **yes**  | Unique instance identifier |

### Response

| Status              | Description                                   |
| ------------------- | --------------------------------------------- |
| **204 No Content**  | Subscription removed (no-op if not found)     |
| **400 Bad Request** | Invalid request body (Zod validation failure) |
