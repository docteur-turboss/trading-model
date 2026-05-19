# API Reference - Trading Model

## Overview

This document describes the internal and external API endpoints for all services in the trading-model monorepo.

---

## Service Discovery

### Register Service

```http
POST /api/services/register
```

Registers a new service instance.

**Request Body:**

```json
{
  "name": "string",
  "version": "string",
  "host": "string",
  "port": 3000,
  "healthEndpoint": "string"
}
```

**Response:** `201 Created`

### Heartbeat

```http
POST /api/services/heartbeat
```

Updates the TTL for a registered service.

**Request Body:**

```json
{
  "serviceId": "string"
}
```

**Response:** `200 OK`

### Get Services

```http
GET /api/services
```

Lists all registered services.

**Response:** `200 OK`

```json
[
  {
    "id": "string",
    "name": "string",
    "host": "string",
    "port": 3000
  }
]
```

---

## Broker Messages

### Send Message

```http
POST /api/messages/send
```

Sends a message to a target service.

**Request Body:**

```json
{
  "targetService": "string",
  "payload": {},
  "deliveryMode": "persistent"
}
```

**Response:** `200 OK`

### Get Messages

```http
GET /api/messages/:id
```

Retrieves a message by ID.

**Response:** `200 OK`

### List Messages

```http
GET /api/messages
```

Lists messages with optional filters.

**Query Parameters:**

- `status` - Filter by delivery status
- `limit` - Max results (default: 50)

**Response:** `200 OK`

---

## Common Errors

| Status Code | Error                 | Description             |
| ----------- | --------------------- | ----------------------- |
| 400         | Bad Request           | Invalid input           |
| 401         | Unauthorized          | Missing or invalid auth |
| 404         | Not Found             | Resource not found      |
| 500         | Internal Server Error | Unexpected error        |
