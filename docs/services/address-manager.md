# @trading-model/address-manager — Service Addresses

Client-side library of every service: where the other services are ([ADR-0072](../adr/0072-dns-routing-and-majors-served-by-services.md)).

## Overview

- **Addresses:** `findService(name)` answers the service's DNS name (compose service, Kubernetes Service; `DNS_NAME_MAP` overrides a name outside Docker and Kubernetes) on port 3000. No registry is asked, no instance is picked: the platform spreads the connections over ready pods (keep-alive: per connection, not per call).

## Factory

```ts
import { createServiceAddressManager } from '@trading-model/address-manager/create-service-address-manager';

const { AddressManager, FIND_A_SERVICE } = createServiceAddressManager(ENV);
```

| Export                       | Description                                                       |
| ---------------------------- | ----------------------------------------------------------------- |
| `AddressManager`             | The instance (`findService`)                                    |
| `FIND_A_SERVICE(name)`       | `Promise<{ host, port }>`: the DNS name of the service, port 3000 |

