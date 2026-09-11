# Operations

This directory contains operational procedures, policies, and runbooks for the Trading Model platform.

## Policies & Procedures

| Document                               | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| [SLO](slo.md)                          | Service Level Objectives and burn-rate alerting             |
| [Incident Response](incident-response.md) | Severity levels, escalation, post-mortem                 |
| [On-Call](on-call.md)                  | Rotation, responsibilities, quick commands                  |

## Runbooks

| Document                               | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| [Service Down](runbooks/runbook-service-down.md)       | Recovery procedure for any service crash             |
| [Database Failover](runbooks/runbook-database-failover.md) | MySQL, MongoDB, Redis failover                    |
| [Message Bus Outage](runbooks/runbook-message-bus-outage.md) | Message-manager outage recovery                |
| [Certificate Expiry](runbooks/runbook-certificate-expiry.md) | mTLS certificate expiry prevention             |
| [Data Corruption](runbooks/runbook-data-corruption.md) | Data corruption detection and recovery               |
| [Deployment Failure](runbooks/runbook-deployment-failure.md) | Failed deployment rollback procedure            |
