# @trading-model/address-manager — Service Addresses and Registration

Client-side library of every service: where the other services are, and (until release N+1 of [ADR-0072](../adr/0072-dns-routing-and-majors-served-by-services.md)) the registration with **discovery-server**.

## Overview

- **Addresses (ADR-0072):** `findService(name)` answers the service's DNS name (compose service, Kubernetes Service; `DNS_NAME_MAP` overrides a name outside Docker and Kubernetes) on port 3000. No registry is asked, no instance is picked: the platform spreads the connections over ready pods (keep-alive: per connection, not per call).
- **Registration (release N only):** register, heartbeat, token rotation and unregistration with discovery-server, read only by release N-1 gateways during the rollout. Removed with discovery-server in release N+1.
- **Routes:** `/status` and `/metrics` of the service (`listenExpress`).

## Factory

```ts
import { createServiceAddressManager } from '@trading-model/address-manager/create-service-address-manager';

const { AddressManager, BOOTSTRAP_ADDRESS_MANAGER, ADDRESS_MANAGER_ROUTES, FIND_A_SERVICE, REGISTRATION_READINESS } =
  createServiceAddressManager(ENV);
```

| Export                       | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `AddressManager`             | The instance (`findService`, `tokenManager`, `lifecycleManager`)       |
| `BOOTSTRAP_ADDRESS_MANAGER()`| Starts registration and heartbeats; returns `{ ready, stop, leave }`   |
| `ADDRESS_MANAGER_ROUTES(app)`| Mounts `/status`, `/metrics`                                         |
| `FIND_A_SERVICE(name)`       | `Promise<{ host, port }>`: the DNS name of the service, port 3000      |
| `REGISTRATION_READINESS`     | Readiness check `discovery-registration` (release N only)              |

`REGISTRATION_READINESS` (`discovery-registration`): not Ready until the first registration, so release N-1 gateways find the pod in the registry. Release N only; removed with discovery-server in N+1 (ADR-0072).

## Lifecycle (release N)

1. `start()` registers the service with `POST /register`; the token is kept by `TokenManager`. Registration retries with exponential backoff (1 s base, 30 s cap) while discovery-server is unreachable.
2. Every `TTL_REFRESH_INTERVAL_MS` (default 15 s): `POST /heartbeat`; after 3 failures with 401/404 the service registers again.
3. Every `TOKEN_REFRESH_INTERVAL_MS` (default 60 s): `POST /token/rotate`.
4. Shutdown (`leave` or a signal): `POST /unregister`.

## Endpoints

### Served

| Method | Path       | Description                          |
| ------ | ---------- | ------------------------------------ |
| GET    | `/status`  | Memory, CPU and uptime of the process|
| GET    | `/metrics` | Prometheus metrics                   |

### Consumed (discovery-server, release N only)

| Method | Path            | Source                 |
| ------ | --------------- | ---------------------- |
| POST   | `/register`     | `AddressManagerClient` |
| POST   | `/heartbeat`    | `AddressManagerClient` |
| POST   | `/token/rotate` | `TokenManager`         |
| POST   | `/unregister`   | `AddressManagerClient` |

## Metrics

| Metric                               | Labels   | Description                   |
| ------------------------------------ | -------- | ----------------------------- |
| `address_manager_registration_total` | `result` | Registration attempts         |
| `address_manager_heartbeat_total`    | `result` | Heartbeat attempts            |

## Environment Schema

`AddressManagerEnvSchema` (`@trading-model/address-manager/config/address-manager-env`); every variable is in [ENV.md](../deployment/ENV.md). Used: `ADDRESS_MANAGER_URL` (discovery-server URL), `SERVICE_NAME`, `INSTANCE_ID`, `APP_VERSION` (registered for N-1 gateways only), `PORT`, `TOKEN_REFRESH_INTERVAL_MS`, `TTL_REFRESH_INTERVAL_MS`, `DNS_NAME_MAP`. `CACHE_TTL_MS`, `DISCOVERY_TIMEOUT_MS` and `SERVICE_PING_TIMEOUT_MS` are no longer read by this package and leave the schema with discovery-server.
