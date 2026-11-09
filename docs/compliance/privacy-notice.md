# Privacy Notice for API Callers — Art. 13 GDPR

> Values below mirror [processing activity 6](data-processing-register.md) of the register and `deploy/edge-proxy/default.conf`. Change them together.

## Who is responsible

The controller and its privacy contact are the ones named in the "Controller" section of the [Data Processing Register](data-processing-register.md). The operating entity fills them in before production (see the production checklist in [DEPLOY.md](../deployment/DEPLOY.md)).

## What we process, why, on which basis

| Item | Value |
| ---- | ----- |
| **Purpose** | Security monitoring and troubleshooting of external calls to the API |
| **Legal basis** | Legitimate interest, Art. 6(1)(f): security of the service (recital 49) |
| **Data** | Caller IP truncated before it is logged (IPv4 /24, IPv6 /48), timestamp, method, path without query string, status, size, duration |
| **Not collected** | User-Agent, X-Forwarded-For, credentials, query string |
| **Retention** | 31 days (Loki `retention_period: 744h`) |
| **Recipients** | Internal: operators (Grafana/Loki). No third party |
| **Transfers outside the EU** | None (Loki is self-hosted) |

A truncated address is pseudonymized, not anonymous, so this notice applies.

## Your rights

You may ask for access, rectification, erasure, restriction, or object to the processing (Art. 15-21). A truncated address cannot be linked to you, so Art. 11 applies: we do not collect more data to identify you, unless you give us elements that let us find your entries. Write to the privacy contact named in the register.

You may also lodge a complaint with the CNIL (<https://www.cnil.fr>) or the supervisory authority of your Member State.
