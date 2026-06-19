# Multi-Region Deployment

This document describes how to deploy the Trading Model platform across multiple
geographic regions / datacenters to achieve high availability, disaster recovery,
and low-latency service-to-service communication.

## Architecture Overview

```
┌──────────────────────┐       ┌──────────────────────┐
│     Region A         │       │     Region B         │
│     (us-east-1)      │       │     (eu-west-1)      │
│                      │       │                      │
│  ┌──────────────┐    │       │  ┌──────────────┐    │
│  │ Discovery    │    │       │  │ Discovery    │    │
│  │ Server A     │────┼───────┼──│ Server B     │    │
│  └──────┬───────┘    │       │  └──────┬───────┘    │
│         │            │       │         │            │
│         │ (shared    │       │         │ (shared    │
│         │  backend)  │       │         │  backend)  │
│         ▼            │       │         ▼            │
│  ┌──────────────┐    │       │  ┌──────────────┐    │
│  │  Redis       │◄───┼───────┼──│  Redis       │    │
│  │  Cluster     │    │       │  │  Cluster     │    │
│  └──────────────┘    │       │  └──────────────┘    │
│                      │       │                      │
│  ┌──────────────┐    │       │  ┌──────────────┐    │
│  │ Financial    │    │       │  │ Financial    │    │
│  │ Scraper A1   │    │       │  │ Scraper B1   │    │
│  ├──────────────┤    │       │  ├──────────────┤    │
│  │ Financial    │    │       │  │ Trader       │    │
│  │ Scraper A2   │    │       │  │ Trainer B1   │    │
│  ├──────────────┤    │       │  ├──────────────┤    │
│  │ Trader       │    │       │  │ Message      │    │
│  │ Trainer A1   │    │       │  │ Manager B1   │    │
│  └──────────────┘    │       │  └──────────────┘    │
│                      │       │                      │
│  ┌──────────────┐    │       │  ┌──────────────┐    │
│  │  MySQL       │    │       │  │  MySQL       │    │
│  │  (replica)   │◄───┼───────┼──│  (primary)   │    │
│  └──────────────┘    │       │  └──────────────┘    │
└──────────────────────┘       └──────────────────────┘
```

## Key Components

### 1. Distributed Registry Backend

The discovery-server uses a pluggable `RegistryBackend` interface:

| Backend | Storage | Use Case |
|---------|---------|----------|
| `InMemoryRegistryBackend` | In-memory `Map` | Development, single-node |
| `RedisRegistryBackend` | Redis (distributed) | Production, multi-node, multi-region |

To enable the Redis backend, set `REDIS_URL` on the discovery-server:

```yaml
environment:
  REDIS_URL: redis://:password@redis-cluster:6379
  REDIS_KEY_PREFIX: "discovery:prod:"
```

All discovery-server instances connected to the same Redis instance/cluster
share the same registry state transparently.

### 2. Multi-URL Discovery Client

Each service client (via `@trading-model/address-manager`) can be configured
with multiple discovery server URLs for failover:

```bash
# Single URL (legacy, backwards-compatible)
ADDRESS_MANAGER_URL=https://discovery-server:3000

# Multiple URLs (JSON array – tried in order)
ADDRESS_MANAGER_URLS='["https://ds-us-east:3000","https://ds-eu-west:3000"]'
```

The client tries each URL sequentially:
1. Primary discovery server
2. Secondary (on failure / timeout)
3. Tertiary, etc.

### 3. Region-Aware Service Discovery

Each service instance can declare its deployment region at registration time
via the `REGION` environment variable:

```bash
REGION=us-east-1
```

When `findService(serviceName)` is called, the address-manager:

1. Queries the region-filtered endpoint (`/services/:name/region/:regionName`)
2. Health-checks the returned instances
3. Falls back to any region if no healthy instance is found in the preferred region

This enables:
- Low-latency routing (services prefer local instances)
- Automatic disaster recovery (region failure → cross-region fallback)

### 4. Token Recovery

If a service restarts, its authentication token is lost. To avoid
re-registration, set `INSTANCE_TOKEN_SECRET` (shared between discovery-server
and service clients):

```bash
INSTANCE_TOKEN_SECRET=your-256-bit-hex-secret
```

The token manager derives a deterministic initial token from the instance ID +
shared secret, enabling heartbeats to resume immediately after restart.

## Configuration

### Discovery Server

```yaml
# docker-compose.override.yml (per-region)
services:
  discovery-server:
    environment:
      - REDIS_URL=redis://:password@redis-cluster:6379
      - REDIS_KEY_PREFIX=discovery:us-east-1:
      - REGION=us-east-1
```

### Service Clients

```yaml
services:
  financial-scraper:
    environment:
      - ADDRESS_MANAGER_URLS=["https://ds-us-east:3000","https://ds-eu-west:3000"]
      - REGION=us-east-1
      - INSTANCE_TOKEN_SECRET=${INSTANCE_TOKEN_SECRET}
```

## Infrastructure Requirements

### Redis Cluster

A Redis cluster is required for the distributed registry backend:

- **Minimum:** 3 master nodes + 3 replica nodes
- **Recommended:** Redis 7+ with TLS and password authentication
- **Deployment options:**
  - Self-managed on VMs / bare metal
  - Managed services: AWS ElastiCache, Azure Cache for Redis, GCP Memorystore

### Cross-Region Networking

- Low-latency links between regions (AWS Direct Connect / Azure ExpressRoute)
- mTLS certificates valid for cross-region DNS names
- Firewall rules allowing inter-region traffic on discovery ports (3000)

### Database Replication

| Database | Replication Strategy |
|----------|---------------------|
| MySQL | Primary-replica cross-region replication |
| MongoDB | Replica set with members in multiple regions |

## Deployment Phases

### Phase 1: Single Region with Redis

1. Deploy a Redis cluster in one region
2. Set `REDIS_URL` on the discovery-server
3. Verify all services register and discover each other

### Phase 2: Second Region

1. Deploy a second infrastructure stack in a new region
2. Connect the second discovery-server to the same Redis cluster
3. Configure `ADDRESS_MANAGER_URLS` on all services to include both regions

### Phase 3: Multi-Region Active-Active

1. Add `REGION` to all service configurations
2. Verify region-aware routing
3. Test failover by disabling one region

## Disaster Recovery

### Scenario: US-East region failure

When the `us-east-1` discovery-server or services become unreachable:

1. Client heartbeats fail → instances are not removed from Redis (they keep
   their last heartbeat timestamp)
2. Services in `eu-west-1` continue heartbeating normally
3. When a service in `eu-west-1` calls `findService()`, it queries
   `/services/:name/region/eu-west-1` and gets only healthy local instances
4. If no local instances are healthy, the fallback to any region kicks in

### Recovery after region restart

When `us-east-1` comes back:
1. Services re-register with the same `instanceId`
2. If `INSTANCE_TOKEN_SECRET` is set, tokens are recovered without
   re-registration
3. The registry in Redis already contains the instances
4. Heartbeats resume and TTL is refreshed

## Testing

See `services/discovery-server/tests/integration/multi-region.spec.ts`
and `packages/address-manager/tests/unit/multi-region.spec.ts`.
