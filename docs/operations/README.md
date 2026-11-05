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
| [Database Failover](runbooks/runbook-database-failover.md) | Loss of `mysql-0` (no MySQL failover, SPIRE stops), MongoDB DLQ / audit trail and Redis recovery, encrypted restores |
| [Message Bus Outage](runbooks/runbook-message-bus-outage.md) | Message-manager outage recovery                |
| [Certificate Expiry](runbooks/runbook-certificate-expiry.md) | mTLS certificate expiry prevention             |
| [Data Corruption](runbooks/runbook-data-corruption.md) | Data corruption detection and recovery               |
| [Audit Chain Broken](runbooks/runbook-audit-chain-broken.md) | Audit trail integrity: broken, unverified or unanchored chain (ADR-0027) |
| [Deployment Failure](runbooks/runbook-deployment-failure.md) | Failed deployment rollback procedure            |
| [Latency and Errors](runbooks/runbook-latency-and-errors.md) | `HighLatency`, `HighErrorRate` and the SLO burn-rate alerts |
| [Circuit Breaker Open](runbooks/runbook-circuit-breaker-open.md) | `CircuitBreakerOpen`: a caller stopped calling a failing instance |
| [Service Discovery](runbooks/runbook-discovery.md) | `InstanceCountLow`, `HeartbeatStopped`: lost redundancy, lost leases |
| [DLQ Backlog](runbooks/runbook-dlq-backlog.md) | `DLQSizeGrowing`, `DLQDrainRateLow`: dead letters not drained |
| [Trainer Failures](runbooks/runbook-trainer.md) | `TrainingCompletionRateLow`, `ModelArtifactWriteFailing` (ADR-0022) |

Every alert links its runbook (`runbook_url`): see the table in [ALERTING.md](ALERTING.md#alert--runbook).
