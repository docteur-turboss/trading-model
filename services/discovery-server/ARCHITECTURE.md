## Overview
This repository implements a **Service Discovery & Address Manager** designed for a **microservices architecture**.

The system enables services to dynamically register themselves, maintain liveness through heartbeats, and allow other services to resolve available service instances without relying on hard-coded network addresses.

The project is implemented in **TypeScript**, uses **Express** as the HTTP layer, and enforces **mutual TLS (mTLS)** authentication using a shared **Root CA**.

## Problem Statement

In a microservices environment:

* Services scale horizontally (multiple instances)
* Services are ephemeral (containers, orchestrators)
* IP addresses and ports change frequently
* Services communicate over HTTP, events, or message brokers

Hard-coding service addresses leads to:

* Tight coupling
* Poor resilience
* Broken deployments during scaling or rolling updates

This Service Discovery component provides **dynamic address resolution**, **liveness tracking**, and **centralized service metadata management**.


## Goals & Non-Goals

### Goals

* Dynamic registration of service instances
* Secure service-to-service communication (mTLS)
* TTL-based liveness detection (heartbeat mechanism)
* Deterministic and idempotent registration
* Minimal runtime dependencies
* Simple in-memory implementation, extensible to Redis / etcd

### Non-Goals

* Active health checks (pull-based probing)
* Full load-balancing strategies (client-side responsibility)
* Persistent storage guarantees across restarts
* Service mesh replacement (Istio, Linkerd)


## High-Level Architecture

```
┌────────────────────┐
│  Microservice A    │
│  (client)          │
│  - register        │
│  - heartbeat       │
│  - resolve         │
└─────────┬──────────┘
          │ mTLS
          ▼
┌────────────────────────────┐
│ Service Discovery Server   │
│                            │
│ ┌────────────┐ ┌────────┐ │
│ │ Controllers│ │ Routes │ │
│ └────┬───────┘ └────┬───┘ │
│      ▼              ▼     │
│ ┌────────────────────────┐│
│ │   ServiceRegistry      ││
│ └──────────┬─────────────┘│
│            ▼               │
│     ┌──────────────┐       │
│     │ LeaseManager │       │
│     └──────────────┘       │
└────────────────────────────┘
```


## Security Architecture (mTLS)

### Authentication Model

* All clients **must present a valid client certificate**
* Server verifies client certificate against a **shared Root CA**
* No token-based authentication (OAuth/JWT) is used
* Trust is established at the TLS layer

### Rationale

* Strong service identity
* No credential exchange at runtime
* Reduced attack surface
* Aligns with zero-trust internal networks

### Certificate Handling

* Certificates are loaded at startup (`readCert.ts`)
* TLS configuration is enforced at the HTTP server level
* Unauthorized connections are rejected before reaching controllers


## Project Structure & Responsibilities

### `app/`

| File       | Responsibility                                 |
| ---------- | ---------------------------------------------- |
| `app.ts`   | Express HTTP server initialization             |
| `index.ts` | Application bootstrap (HTTP + background jobs) |


### `controllers/`

Controllers implement **HTTP use-cases only** and contain no business logic.

| Controller                | Responsibility                       |
| ------------------------- | ------------------------------------ |
| `register.controller.ts`  | Register or update service instances |
| `heartbeat.controller.ts` | Refresh service liveness (TTL)       |

Tests (`*.test.ts`) validate behavior, edge cases, and error paths.


### `routes/`

Defines HTTP routing and controller binding.

| Route                 | Endpoint          |
| --------------------- | ----------------- |
| `register.routes.ts`  | `POST /register`  |
| `heartbeat.routes.ts` | `POST /heartbeat` |

Routes are intentionally thin and contain no logic.


### `core/`

Core domain logic. **Framework-agnostic**.

| File                 | Responsibility                                 |
| -------------------- | ---------------------------------------------- |
| `ServiceRegistry.ts` | In-memory storage and indexing of services     |
| `LeaseManager.ts`    | TTL management and eviction of dead instances  |
| `type.ts`            | Domain types (ServiceInstance, metadata, etc.) |

This layer can be reused with:

* Redis
* etcd
* Consul-style backends


### `utils/`

Shared utilities, stateless and side-effect free.

| Utility                | Purpose                  |
| ---------------------- | ------------------------ |
| `generateRandomStr.ts` | Instance ID generation   |
| `readCert.ts`          | TLS certificate loading  |
| `validate.ts`          | Input validation helpers |


### `types/`
Global TypeScript type extensions.

| File           | Purpose                           |
| -------------- | --------------------------------- |
| `express.d.ts` | Express request typing extensions |


### `tests/`
* Unit tests for controllers and core logic
* No reliance on real network or TLS
* Mocks for registry and lease manager

## Service Lifecycle
### Registration

```
POST /register
```

* Service registers itself
* Instance ID generated or reused
* TTL initialized
* Entry added to registry

### Heartbeat

```
POST /heartbeat
```

* Service periodically refreshes its lease
* TTL expiration is pushed forward
* Missing heartbeats lead to eviction

### Eviction
* LeaseManager runs periodically
* Instances exceeding TTL are removed
* Registry remains consistent

## Design Decisions

### In-Memory Registry (Initial Version)
**Why**:
* Simplicity
* Low operational overhead
* Suitable for small/medium clusters

**Tradeoff**:
* No persistence across restarts

### Passive Health Checks (Heartbeat-based)

**Why**:
* Avoid network probing complexity
* No cascading failures
* Responsibility remains client-side

### Strict Separation of Concerns
* Controllers = HTTP
* Core = business logic
* Utils = helpers
* No cross-layer dependencies

## Scalability & Future Extensions

Planned / supported extensions:

* Redis-backed ServiceRegistry
* Distributed LeaseManager using TTL keys
* Watch / streaming API for clients
* Client-side SDK (Address Manager)
* Metrics (Prometheus)
* Audit logs

## Operational Considerations

* Stateless process
* Safe to restart at any time
* Horizontal scaling supported (with shared backend)
* TLS certificates must be rotated externally
* Logs are structured and machine-readable

## Summary
This Service Discovery system provides:

* Secure service registration (mTLS)
* Dynamic service resolution
* Deterministic TTL-based liveness
* Clean architecture boundaries
* Production-ready foundations

It is designed to be **simple, secure, and evolvable**, serving as a core building block for a microservices platform.