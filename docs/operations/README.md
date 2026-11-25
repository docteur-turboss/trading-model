# Operations

This directory contains operational procedures, policies, and runbooks for the Trading Model platform.

## Policies & Procedures

| Document                               | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| [SLO](slo.md)                          | Service Level Objectives and burn-rate alerting             |
| [Incident Response](incident-response.md) | Checklist, escalation, channels                          |
| [On-Call](on-call.md)                  | Rotation, responsibilities, quick commands                  |

## Runbooks

| Document                               | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| [Service Down](runbooks/runbook-service-down.md)       | Recovery procedure for any service crash             |
| [Database Failover](runbooks/runbook-database-failover.md) | Loss of `mysql-0` (no MySQL failover, ingestion stops), MongoDB DLQ / audit trail and Redis recovery, encrypted restores |
| [Message Bus Outage](runbooks/runbook-message-bus-outage.md) | Bus (Redis journal) outage recovery                |
| [Certificate Expiry](runbooks/runbook-certificate-expiry.md) | mTLS certificate expiry prevention             |
| [Data Corruption](runbooks/runbook-data-corruption.md) | Data corruption detection and recovery               |
| [Audit Chain Broken](runbooks/runbook-audit-chain-broken.md) | Audit trail integrity: broken, unverified or unanchored chain (ADR-0027) |
| [Deployment Failure](runbooks/runbook-deployment-failure.md) | Failed deployment rollback procedure            |
| [Latency and Errors](runbooks/runbook-latency-and-errors.md) | SLO burn-rate alerts (availability, latency) |
| [Circuit Breaker Open](runbooks/runbook-circuit-breaker-open.md) | `HttpCircuitBreakerRejecting`: a caller refuses its calls to a failing dependency |
| [Trainer Failures](runbooks/runbook-trainer.md) | `TrainingCompletionRateLow`, `ModelArtifactWriteFailing` (ADR-0022) |

Every alert links its runbook (`runbook_url`): see the table in [ALERTING.md](ALERTING.md#alert--runbook).
