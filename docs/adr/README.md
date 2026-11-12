# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the trading-model platform.

## What is an ADR?

An ADR documents a significant architectural decision, including the context, alternatives considered, and the rationale for the chosen approach. ADRs are immutable once accepted — superseded decisions are documented in a new ADR that references the old one.

## Index

| ADR                                           | Title                                                  | Status   | Date    |
| --------------------------------------------- | ------------------------------------------------------ | -------- | ------- |
| [ADR-0001](./0001-ga-dqn-training.md)         | Genetic Algorithm + Deep Q-Learning for Agent Training | Accepted | 2026-06 |
| [ADR-0002](./0002-redis-pub-sub.md)           | Redis Streams for Inter-Service Messaging              | Superseded by [ADR-0019](./0019-message-broker-as-built.md) | 2026-06 |
| [ADR-0003](./0003-mongodb-persistence.md)     | MongoDB for Audit and DLQ Persistence                    | Superseded by [ADR-0020](./0020-database-topology-as-deployed.md) | 2026-06 |
| [ADR-0004](./0004-mysql-group-replication.md) | MySQL with Group Replication for Market Data           | Superseded by [ADR-0020](./0020-database-topology-as-deployed.md) | 2026-06 |
| [ADR-0005](./0005-mtls-security.md)           | Mutual TLS for All Inter-Service Communication         | Superseded by [ADR-0011](./0011-spiffe-spire-workload-identity.md) | 2026-06 |
| [ADR-0006](./0006-monorepo-bun-workspaces.md) | Monorepo Structure with bun Workspaces                 | Accepted | 2026-06 |
| [ADR-0007](./0007-common-package-split.md)   | Common Package Split                                   | Implemented | 2026-06 |
| [ADR-0008](./0008-message-broker-choice.md)  | Message Broker Choice                                  | Superseded by [ADR-0019](./0019-message-broker-as-built.md) | 2026-06 |
| [ADR-0009](./0009-certificate-utils-structure.md) | Certificate Utils Structure                       | Superseded by [ADR-0011](./0011-spiffe-spire-workload-identity.md) | 2026-06 |
| [ADR-0010](./0010-clean-architecture-migration.md) | Clean Architecture Migration                    | Implemented | 2026-06 |
| [ADR-0011](./0011-spiffe-spire-workload-identity.md) | SPIFFE/SPIRE Workload Identity                 | Accepted | 2026-09 |
| [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) | Dead Code Removal via Reachability Analysis and Runtime Entrypoint Fix | Accepted | 2026-10 |
| [ADR-0013](./0013-config-gated-dead-code-removal.md) | Removal of Configuration-Gated Dead Code Missed by Import Reachability (address-manager Discovery WebSocket Client) | Accepted | 2026-10 |
| [ADR-0015](./0015-hexagonal-layering-completion.md) | Hexagonal Layering Completion Across Services | Accepted | 2026-10 |
| [ADR-0016](./0016-shared-contracts-ownership.md) | Shared Contracts Owned by `@trading-model/contracts` and Manifest-Checked Dependencies | Accepted | 2026-10 |
| [ADR-0017](./0017-no-swallowed-errors.md) | No Swallowed Errors — Lint Rule, GritQL Plugin and Review Criterion | Accepted | 2026-10 |
| [ADR-0018](./0018-temporary-frontend-removal.md) | Temporary Removal of the Admin Frontend (`admin-interface`) | Accepted | 2026-10 |
| [ADR-0019](./0019-message-broker-as-built.md) | Message Broker As Built — HTTP Pub/Sub Without Message Persistence | Superseded by [ADR-0048](./0048-durable-message-journal-in-redis-streams.md) | 2026-10 |
| [ADR-0020](./0020-database-topology-as-deployed.md) | Database Topology As Deployed — MySQL and MongoDB | Accepted | 2026-10 |
| [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) | HTTP API Schemas Owned by Services, OpenAPI Generated From Zod | Accepted | 2026-10 |
| [ADR-0022](./0022-versioned-model-artifacts.md) | Versioned Model Artifacts Instead of Genomes in the Public API | Accepted | 2026-10 |
| [ADR-0023](./0023-discovery-registry-in-redis.md) | Discovery Registry Shared Through Redis | Accepted | 2026-10 |
| [ADR-0024](./0024-pod-spread-across-nodes.md) | Replicas Spread Evenly Across Nodes | Accepted | 2026-10 |
| [ADR-0025](./0025-ga-fitness-wired-to-fitness-type.md) | GA Fitness Computed on Wallet PnL and Selected by `fitnessType`; DQN Learning From Its Own Experience | Accepted | 2026-10 |
| [ADR-0026](./0026-binance-public-market-data-kept.md) | Binance Kept as the Market Data Source While Its Public API Answers From the EU | Accepted | 2026-10 |
| [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) | Audit Trail Verified by audit-logger and Anchored Outside MongoDB | Accepted | 2026-10 |
| [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md) | Orphan Subsystems Retired (audit-logger Job Scheduler, `@trading-model/jobs`) and Reachability Made a Gate | Accepted | 2026-10 |
| [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) | Point-in-Time Features and Explicit Success Criteria for the MT4 Walk-Forward Validation | Accepted | 2026-10 |
| [ADR-0031](./0031-point-in-time-recovery-hourly-archives.md) | Point-in-Time Recovery From Hourly Binlog and Oplog Archives (RPO 1 h, 72 h Window) | Accepted | 2026-11 |
| [ADR-0032](./0032-gfs-backup-retention.md) | Grandfather-Father-Son Backup Retention, Long Tiers Off-site for the Audit Trail and MySQL | Accepted | 2026-11 |
| [ADR-0033](./0033-offsite-backup-bucket-object-lock.md) | Off-site Backup Bucket Under Object Lock (Compliance, 30-31 Days), Checked Before Every Deploy | Accepted | 2026-11 |
| [ADR-0034](./0034-backup-key-custody-and-weekly-escrow-check.md) | Two Backup Keys in Production, Escrow Key Verified Weekly by GitHub Actions | Accepted | 2026-11 |
| [ADR-0035](./0035-sealed-secrets-key-daily-backup-by-github-actions.md) | SealedSecrets Controller Keys Backed Up Daily by a Scheduled GitHub Actions Workflow | Accepted | 2026-11 |
| [ADR-0036](./0036-multi-dimension-signals-mvp.md) | Multi-Dimension Signals MVP — Frozen Schema, Static Source Registry of Free Sources, Generic `rest_api` Worker | Accepted | 2026-11 |
| [ADR-0037](./0037-typedoc-html-not-versioned.md) | Generated TypeDoc HTML Is Not Versioned | Accepted | 2026-11 |
| [ADR-0038](./0038-release-images-scanned-attested-signed-and-verified.md) | Release Images Are Scanned, Carry SBOM and Provenance, Are Signed Keyless, and Are Verified at Deploy | Accepted | 2026-11 |
| [ADR-0039](./0039-configuration-feature-flags.md) | Configuration Feature Flags (env booleans, fallback switches) | Accepted | 2026-11 |
| [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) | Locked, Resumable Schema Migrations and the Expand/Contract Rule | Accepted | 2026-11 |
| [ADR-0041](./0041-least-privilege-deploy-identities.md) | Least-Privilege Deploy Identities — Application and Cluster-Scope, Bounded Tokens | Accepted | 2026-11 |
| [ADR-0042](./0042-singleton-collector-with-verified-recovery.md) | Singleton Collector Kept, Recovery Verified After Each Deploy | Superseded by [ADR-0057](./0057-collector-handover-through-a-lease.md) | 2026-11 |
| [ADR-0043](./0043-message-delivery-once-per-subscribed-service.md) | Message Delivery Once per Subscribed Service (Consumer Group) | Accepted | 2026-11 |
| [ADR-0044](./0044-singleton-trainer.md) | trader-trainer Runs as a Singleton | Accepted | 2026-11 |
| [ADR-0045](./0045-single-service-resolution-strategy.md) | One Service Resolution Strategy: Registry Says Alive, Platform Says Where | Accepted | 2026-11 |
| [ADR-0046](./0046-simplification-trajectory.md) | Simplification Trajectory for the Services, Broker, Discovery and DLQ | Proposed | 2026-11 |
| [ADR-0047](./0047-redis-isolation-per-service.md) | Redis Isolated Per Service — ACL Users, In-Process Address Cache, In-Memory DLQ Rate Limiter | Accepted | 2026-11 |
| [ADR-0048](./0048-durable-message-journal-in-redis-streams.md) | Durable Message Journal in Redis Streams — Accept First, Deliver Afterwards | Accepted | 2026-11 |
| [ADR-0049](./0049-downstream-context-for-models-and-signals.md) | Downstream Context and Contract for Trained Models and Collected Signals | Proposed | 2026-11 |
| [ADR-0050](./0050-audit-chain-single-writer-lease.md) | One Writer at a Time on the Audit Chain Head (Lease) | Accepted | 2026-11 |
| [ADR-0051](./0051-mysql-retention-cronjob.md) | MySQL Retention Job for Market Data and Signals (CronJob, `retention` User) | Accepted | 2026-11 |
| [ADR-0052](./0052-audit-chain-amortized-lease-batched-writes.md) | Amortized Audit Chain Lease and Batched Writes | Accepted | 2026-11 |
| [ADR-0053](./0053-order-books-persisted-not-served.md) | Order Books Persisted in MySQL for Replay, Not Served by the API | Accepted | 2026-11 |
| [ADR-0054](./0054-public-read-pagination-and-proxy-response-cap.md) | Keyset Pagination of the Public Market Data Reads, Capped Proxied Answers | Accepted | 2026-11 |
| [ADR-0055](./0055-observability-storage-retention.md) | Observability Storage on K8s: Jaeger Badger on a PVC, Bounded Loki Retention | Accepted | 2026-11 |
| [ADR-0056](./0056-infrastructure-metrics-exporters.md) | Infrastructure Metrics: kube-state-metrics, node-exporter, Kubelet and Database Exporter Sidecars | Accepted | 2026-11 |
| [ADR-0057](./0057-collector-handover-through-a-lease.md) | Collector Handed Over Through a Kubernetes Lease | Accepted | 2026-11 |
| [ADR-0058](./0058-trainer-handover-through-a-lease.md) | trader-trainer Handed Over Through a Kubernetes Lease | Accepted | 2026-11 |
| [ADR-0059](./0059-scoped-api-keys-and-dlq-actor.md) | Scoped API Keys, and the Key Name as Actor of DLQ Audit Events | Accepted | 2026-11 |
| [ADR-0060](./0060-database-client-traffic-unencrypted-in-cluster.md) | Database Client Traffic Is Not Encrypted in the Cluster (Accepted Residual Risk, TLS Planned) | Accepted | 2026-11 |
| [ADR-0061](./0061-n-1-compatibility-of-public-api-and-bus-messages.md) | N-1 Compatibility of the Public API and the Bus Messages | Accepted | 2026-11 |
| [ADR-0062](./0062-alerting-path-in-two-replicas-in-production.md) | Alerting Path in Two Replicas in Production | Accepted | 2026-11 |
| [ADR-0063](./0063-grafana-per-person-access-through-oidc.md) | Grafana Per-Person Access Through OIDC | Accepted | 2026-11 |
| [ADR-0064](./0064-risk-and-execution-context-before-order-flow.md) | Risk and Execution Context, Independent of the Model, Required Before Any Order Flow | Proposed | 2026-11 |
| [ADR-0065](./0065-spire-datastore-sqlite-and-4h-svid-ttl.md) | SPIRE Server Datastore in SQLite on Its Own Volume, SVID TTL 4 Hours | Accepted | 2026-11 |
| [ADR-0066](./0066-simulated-fills-at-next-bar-open-with-execution-costs.md) | Simulated Fills at the Next Bar Open With Half-Spread and Slippage Costs | Accepted | 2026-11 |

**Numbering gaps.** ADR-0014 and ADR-0028 do not exist. No file with either number has ever been committed on any branch, and no document refers to them, so they were skipped when the numbers were assigned and carry no decision. Do not reuse them for unrelated records.

## Keeping ADRs true to the runtime

`bun run adr:check` (`scripts/adr-check.mjs`, run by pre-push and CI) enforces:

- **Status** is one of Proposed, Accepted, Implemented, Deprecated, or `Superseded by [ADR-NNNN](./NNNN-....md)`.
- **Supersession goes both ways.** The successor has a `**Supersedes:**` line linking back, and every ADR it supersedes says so. When a change removes or replaces what an ADR decided (as ADR-0012 did for ADR-0002/0008), write the superseding ADR in the same change.
- **Every Accepted or Implemented ADR has a `**Verified by:**` line** naming, in backticks, what proves it today: a `bun run <script>`, a test file, or a script run by a gate. When nothing automated can, write `manual review YYYY-MM-DD`; reviews older than 180 days are reported.
- This index lists every ADR once, with its status.
- **Architecture pages cite real symbols.** A PascalCase `Name` in code in `docs/architecture/*.md` must appear in `services/` or `packages/` (exceptions: `SYMBOL_EXCEPTIONS`).

The check proves that each decision is tied to a live check, not that the check covers every sentence of the ADR: when you change what an ADR describes, update the check it names.
