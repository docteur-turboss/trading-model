# Business Continuity & Disaster Recovery Policy

> **Version:** 1.0  
> **Effective:** 2026-06  
> **Review:** Annual (full plan test)  
> **Regulatory alignment:** DORA Art. 11-13, ISO 22301, NIST SP 800-34

## 1. Policy Statement

This policy defines the Business Continuity (BC) and Disaster Recovery (DR) framework for the trading-model platform. It ensures that critical platform functions can be maintained or restored within defined timeframes in the event of a disruption.

**Scope:** All 7 microservices, 12 packages, databases (MongoDB, MySQL, Redis), CI/CD infrastructure, and supporting observability stack.

## 2. Business Impact Analysis (BIA)

### 2.1 Service Criticality Classification

| Tier | Definition | Services | Maximum Tolerable Downtime (MTD) |
|---|---|---|---|
| **T1 — Critical** | Core platform function; loss immediately impacts compliance or security | spire-server, discovery-server | 15 minutes |
| **T2 — High** | Core business function; loss significantly impacts platform capability | message-manager, audit-logger, trader-trainer | 1 hour |
| **T3 — Medium** | Supporting function; loss impacts operations but not compliance | financial-scraper, dlq-service, api-gateway | 4 hours |
| **T4 — Low** | Non-critical; loss has minimal operational impact | monitoring stack | 24 hours |

### 2.2 Recovery Objectives

| Service Tier | Recovery Time Objective (RTO) | Recovery Point Objective (RPO) |
|---|---|---|
| **T1 — Critical** | ≤ 15 minutes | Near-zero (AOF + synchronous replication) |
| **T2 — High** | ≤ 1 hour | ≤ 5 minutes |
| **T3 — Medium** | ≤ 4 hours | ≤ 1 hour |
| **T4 — Low** | ≤ 24 hours | ≤ 24 hours |

**Two RTOs, two meanings.** The service-tier RTO above is the time to get the
*service* running again when its data store is intact (restart, reschedule,
failover to a replica, SVID re-issue): T1 spire-server and discovery-server
15 minutes, T2 audit-logger, message-manager and trader-trainer 1 hour. The
**data-store RTO** of [BACKUP_DR.md](../deployment/BACKUP_DR.md) (4 hours;
1 hour for trained agents and the SealedSecrets controller keys) is the time to
rebuild the *data* from backups after the store is lost: new volume or cluster,
fetch from the off-site bucket, restore. It is also the "complete platform
recovery within 4 hours" of the annual full recovery drill (§ 7). A service
whose data is lost is back within the data-store RTO, not the tier RTO: for
example spire-server (T1) is restarted in 15 minutes from its volume, but
needs up to 4 hours when its datastore and CA keys must be restored.

**Data RPO, as committed (ADR-0031):** the databases are recovered to within
**1 hour** of an incident: MongoDB `mongo-audit` and `mongo-dlq`, MySQL
`financial_scraper` (hourly binlog / oplog archives,
point-in-time restore over the last 72 hours, daily backups for 30 days before
that). The SPIRE datastore and CA keys (SQLite on the server volume, ADR-0065)
are backed up daily (24 h). This is the
RPO of the data behind every tier: the ≤ 5 minutes of T2 (audit-logger) is not
met for its data, which is recovered to within 1 hour.

## 3. Disaster Scenarios

### 3.1 Scenario Assessment

| Scenario | Likelihood | Impact | Tier Classification |
|---|---|---|---|
| **Single service crash** | High | Isolated | L4 — Low |
| **Database node failure** | Medium | High (data unavailable) | L2 — High |
| **Redis cluster failure** | Medium | Critical (message routing) | L1 — Critical |
| **SPIRE server outage** | Low | Critical (no new SVIDs) | L1 — Critical |
| **Full region failure** | Low | Critical (full platform) | L1 — Critical |
| **CI/CD pipeline compromise** | Low | High (supply chain risk) | L2 — High |
| **Cryptographic key compromise** | Low | Critical (full rebuild) | L1 — Critical |

### 3.2 Detailed Recovery Procedures

#### 3.2.1 Single Service Crash

1. **Detection:** Kubernetes auto-restart or health check failure alert
2. **Response:** Automatic — container restarted via liveness probe
3. **Recovery:** Service resumes within seconds (stateless) to minutes (stateful with warm-up)
4. **Verification:** Health endpoint returns 200

#### 3.2.2 Database Node Failure (MongoDB)

1. **Detection:** Prometheus alert — MongoDB replica set state change
2. **Response:** Automatic failover to secondary replica (MongoDB replica set, ≤ 5s)
3. **Recovery:** Failed node re-joins as secondary after repair
4. **Backup:** Daily `mongodump --oplog` of each replica set (dlq, audit), plus the oplog archived every hour: `restore-k8s.sh --until <instant>` restores to any point of the last 72 h (RPO 1 h, ADR-0031).
5. **Verification:** Replica set status: `rs.status().ok === 1`

#### 3.2.3 SPIRE Server Outage

1. **Detection:** SVID renewal failure alerts from all services
2. **Impact:** No new SVIDs, no renewal. Existing SVIDs valid for up to the configured TTL.
3. **Response:**
   - Diagnose SPIRE server (spire-server) and agent health
   - Reconcile workload entries (`spire-entries` sidecar in K8s, `spire-bootstrap` in compose)
   - Restart `spiffe-helper` sidecars to re-fetch SVIDs
4. **Escalation:** If unrecoverable within 2 hours (SVIDs live 4 hours and are renewed at half-life, ADR-0065), restore the SPIRE datastore and CA keys (one tar) from the daily backup: `restore-k8s.sh --components spire`
5. **Recovery:** With both restored the trust bundle is unchanged and workloads keep their SVIDs; re-bootstrap with re-enrolment of all workloads only if no backup is usable

#### 3.2.4 Full Platform Outage

1. **Detection:** Complete loss of platform monitoring
2. **Response:** Infrastructure team notified via out-of-band communication
3. **Recovery:**
   - Infrastructure rebuild via `docker-compose up -d` or `kubectl apply -f deploy/`
   - Database restoration from backup (MongoDB and MySQL: latest daily dump, then the hourly oplog / binlog archives up to the last one: `restore-k8s.sh --until`)
   - SPIRE restore (datastore and CA keys, independent of MySQL since ADR-0065) or re-bootstrap (SVID re-enrolment of all workloads)
   - Service restart in dependency order

## 4. Backup Strategy

### 4.1 Backup Schedule

| Data | Type | Frequency | Retention | Location |
|---|---|---|---|---|
| SPIRE datastore + CA keys (SQLite + `keys-sqlite.json`, ADR-0065) | Online SQLite snapshot + file copy, one tar | Daily (CronJob) | 30 days local, 31 days off-site (never promoted) | `backup-data` volume + S3-compatible store (mandatory) |
| MongoDB (dlq, audit) | `mongodump --oplog` | Daily | 30 days local, 31 days off-site; audit dump also off-site weekly 12 weeks, monthly 60 months (ADR-0032) | `backup-data` volume + S3-compatible store (mandatory) |
| MySQL (market data) | Dump | Daily | 30 days local, 31 days off-site; also off-site weekly 12 weeks, monthly 60 months (ADR-0032) | `backup-data` volume + S3-compatible store (mandatory) |
| MySQL binlogs (market data) | Closed binlogs (`backup-incremental-k8s.sh`) | Hourly (CronJob `db-backup-incremental`) | 72 h local, bucket lifecycle off-site (3 days), never promoted | `backup-data` volume + S3-compatible store (mandatory) |
| MongoDB oplog (dlq, audit) | Oplog entries since the previous archive | Hourly (CronJob `db-backup-incremental`) | 72 h local, bucket lifecycle off-site (3 days), never promoted | `backup-data` volume + S3-compatible store (mandatory) |
| Redis (message journal, discovery registrations, DLQ retry queue) | Not backed up | — | — | Registrations and DLQ queue rebuilt by the services; the journal is not rebuildable, see the RPO in [BACKUP_DR.md](../deployment/BACKUP_DR.md) |

Every dump is age-encrypted before it is written; the off-site copy only sends encrypted files.
| K8s manifests | Git | Every commit | Full history | GitHub |
| Docker images | Registry | Every build | Tagged versions | Docker Hub / GHCR |

### 4.2 Backup Verification

- Restore drill on every CI run (`k8s` job, `tests/k8s/run-kind.sh`): the daily CronJob backs up, the drill writes markers, audit events and a dead letter after the dump, stops the writers, records the instant, runs the hourly archive CronJob, drops data (the real `audit` and `dlq` databases, markers, `market_candles`, the SPIRE server volume), then restores as after the loss of the cluster: `fetch-offsite.sh --pitr` fetches the newest complete run and the binlog / oplog archives from the off-site bucket into a pod that never mounts the `backup-data` volume, and `restore-k8s.sh --until <instant>` restores MongoDB (dlq + audit), MySQL and the SPIRE CA; it passes only if every audit event of the instant (those written after the dump included) comes back with the same hashes and a verified hash chain, nothing written after the instant comes back, the data and the trust bundle come back and mTLS still works
- Weekly restore drill of the Docker scripts (`backup-test.yml`, `tests/backup/compose-restore-drill.sh`): containers and volumes deleted, then restored
- Both drills time every step and compare the recovery with a budget (`RESTORE_DRILL_BUDGET_SECONDS`): table in the job summary, `restore-drill-timings.json` as an artifact; see the [DR Exercise Log](dr-exercise-log.md)
- Off-site fetch tests (`backup-test.yml`, `tests/backup/fetch-offsite.test.sh`): newest complete run chosen from an S3 store, files still encrypted, refusal on an incomplete or absent run and on an empty or unreachable bucket
- Integrity: age authenticates every encrypted file (a corrupted or truncated file fails to decrypt); no separate checksum
- Monitoring: alerts on a failed, stale, missing or unencrypted backup and on a failed off-site copy (`observability/alerting.yml`)

## 5. Dependency Order for Recovery

```
SPIRE Server ────────────────────┐
                                │
Discovery Server ───────────────┤
                                │
Message Manager ────────────────┤
                                ├──► All Other Services
Database (MongoDB/MySQL/Redis)──┤
                                │
Monitoring Stack ───────────────┘
```

**Ordered recovery sequence:**

1. **Databases** — MongoDB, MySQL, Redis (restore from backup if needed)
2. **SPIRE Server** — restore SPIRE datastore, reconcile entries, re-issue SVIDs
3. **Discovery Server** — Start first for service registry
4. **Message Manager** — Start next for inter-service communication
5. **All other services** — Parallel start (financial-scraper, trader-trainer, etc.)
6. **Monitoring Stack** — Prometheus, Grafana, Loki, Jaeger

## 6. Communication During Disruption

| Stakeholder | Method | Frequency |
|---|---|---|
| **Internal team** | Incident channel (Slack/Teams) | Every 30 minutes during L1-L2 |
| **Platform Security Lead** | Phone | Immediate for L1 |
| **Compliance officer** | Email + phone | Within regulatory notification timeline |

## 7. Plan Maintenance & Testing

| Activity | Frequency | Success Criteria |
|---|---|---|
| **Backup restoration test** | Every CI run (K8s) + weekly (Docker) | Restored data and SPIRE trust bundle identical to the backed-up state |
| **Certificate expiry simulation** | Quarterly | Auto-renewal completes without manual intervention |
| **Tabletop exercise** | Annual | All stakeholders execute response within RTO |
| **Full recovery drill** | Annual | Complete platform recovery within 4 hours |
| **Regional failover** (runbook: [MULTI_REGION.md](../deployment/MULTI_REGION.md#disaster-recovery-without-a-second-region)) | Annual, with the full recovery drill; never exercised yet | New cluster, DNS and data restored from the off-site bucket within the 4 hour data-store RTO plus cluster creation |
| **Plan review** | Annual | All service dependencies and RTO/RPO targets verified |

Every exercise is recorded in the [DR Exercise Log](dr-exercise-log.md) (date,
scenario, environment, duration per step, gap to the RTO / RPO, actions). The
automated restore drills time each step and compare the recovery with a budget
(`RESTORE_DRILL_BUDGET_SECONDS`, see the log).

## 8. Cross-References

| Document | Relevance |
|---|---|
| [Incident Response Policy](incident-response-policy.md) | L1-L4 incident classification and response |
| `docs/operations/runbooks/runbook-database-failover.md` | Technical database failover procedure |
| `docs/operations/runbooks/runbook-service-down.md` | Single service recovery procedure |
| `docs/operations/runbooks/runbook-certificate-expiry.md` | SVID / certificate expiry runbook |
| `docs/operations/runbooks/runbook-data-corruption.md` | Data corruption recovery |
| `docs/operations/runbooks/runbook-message-bus-outage.md` | Redis/message-manager recovery |
| `docs/operations/runbooks/runbook-deployment-failure.md` | Deployment failure recovery |
| `docs/deployment/BACKUP_DR.md` | Technical backup and DR configuration |
| [DR Exercise Log](dr-exercise-log.md) | Record of DR exercises and restore drill timings |
| `docs/deployment/DATABASE.md` | Database setup and replication |
| `docs/deployment/DOCKER.md` | Container orchestration |
| `docs/deployment/KUBERNETES.md` | K8s deployment and scaling |
| `scripts/` | Automation scripts for recovery operations |
