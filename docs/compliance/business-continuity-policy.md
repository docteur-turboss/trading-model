# Business Continuity & Disaster Recovery Policy

> **Version:** 1.0  
> **Effective:** 2026-06  
> **Review:** Annual (full plan test)  
> **Regulatory alignment:** DORA Art. 11-13, ISO 22301, NIST SP 800-34

## 1. Policy Statement

This policy defines the Business Continuity (BC) and Disaster Recovery (DR) framework for the trading-model platform. It ensures that critical platform functions can be maintained or restored within defined timeframes in the event of a disruption.

**Scope:** All 9 microservices, 5 packages, databases (MongoDB, MySQL, Redis), CI/CD infrastructure, and supporting observability stack.

## 2. Business Impact Analysis (BIA)

### 2.1 Service Criticality Classification

| Tier | Definition | Services | Maximum Tolerable Downtime (MTD) |
|---|---|---|---|
| **T1 — Critical** | Core platform function; loss immediately impacts compliance or security | certificate-authority, discovery-server | 15 minutes |
| **T2 — High** | Core business function; loss significantly impacts platform capability | message-manager, audit-logger, trader-trainer | 1 hour |
| **T3 — Medium** | Supporting function; loss impacts operations but not compliance | financial-scraper, dlq-service, api-gateway | 4 hours |
| **T4 — Low** | Non-critical; loss has minimal operational impact | admin-interface, monitoring stack | 24 hours |

### 2.2 Recovery Objectives

| Service Tier | Recovery Time Objective (RTO) | Recovery Point Objective (RPO) |
|---|---|---|
| **T1 — Critical** | ≤ 15 minutes | Near-zero (AOF + synchronous replication) |
| **T2 — High** | ≤ 1 hour | ≤ 5 minutes |
| **T3 — Medium** | ≤ 4 hours | ≤ 1 hour |
| **T4 — Low** | ≤ 24 hours | ≤ 24 hours |

## 3. Disaster Scenarios

### 3.1 Scenario Assessment

| Scenario | Likelihood | Impact | Tier Classification |
|---|---|---|---|
| **Single service crash** | High | Isolated | L4 — Low |
| **Database node failure** | Medium | High (data unavailable) | L2 — High |
| **Redis cluster failure** | Medium | Critical (message routing) | L1 — Critical |
| **Certificate authority outage** | Low | Critical (no new certificates) | L1 — Critical |
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
4. **Backup:** Daily MongoDB dump (or Atlas snapshot). Point-in-time recovery available.
5. **Verification:** Replica set status: `rs.status().ok === 1`

#### 3.2.3 Certificate Authority Outage

1. **Detection:** Certificate renewal failure alerts from all services
2. **Impact:** No new certificates, no certificate renewal. Existing certificates valid for up to 7 days.
3. **Response:**
   - Diagnose CA service (certificate-authority:8447)
   - If CA database (MongoDB) unavailable, Redis cache may serve CRL data temporarily
   - If CA key files corrupted, restore from encrypted backup (CronJob daily)
4. **Escalation:** If unrecoverable within 4 hours, generate temporary self-signed certs via `scripts/generate-certs.sh`
5. **Recovery:** Full CA rebuild from backup or bootstrap new CA with re-enrolment of all services

#### 3.2.4 Full Platform Outage

1. **Detection:** Complete loss of platform monitoring
2. **Response:** Infrastructure team notified via out-of-band communication
3. **Recovery:**
   - Infrastructure rebuild via `docker-compose up -d` or `kubectl apply -f deploy/`
   - Database restoration from backup (MongoDB: latest dump, MySQL: binlog + dump)
   - Certificate re-issuance from CA backup or bootstrap
   - Service restart in dependency order

## 4. Backup Strategy

### 4.1 Backup Schedule

| Data | Type | Frequency | Retention | Location |
|---|---|---|---|---|
| CA keys (AES-256 encrypted) | File | Daily (CronJob) | 30 days | Off-site / different K8s cluster |
| MongoDB (audit, cert, dlq) | Dump | Daily | 30 days | Object storage (S3-compatible) |
| MySQL (market data) | Dump | Daily | 30 days | Object storage (S3-compatible) |
| Redis (streams, cache) | RDB / AOF | Continuous AOF | 7 days | Persistent volume |
| K8s manifests | Git | Every commit | Full history | GitHub |
| Docker images | Registry | Every build | Tagged versions | Docker Hub / GHCR |

### 4.2 Backup Verification

- Weekly automated restoration test for MongoDB and MySQL (CI pipeline)
- Monthly full recovery drill for CA keys
- Backup integrity verified via checksum after each backup job

## 5. Dependency Order for Recovery

```
Certificate Authority (CA) ────┐
                               │
Discovery Server ──────────────┤
                               │
Message Manager ───────────────┤
                               ├──► All Other Services
Database (MongoDB/MySQL/Redis)─┤
                               │
Monitoring Stack ──────────────┘
```

**Ordered recovery sequence:**

1. **Databases** — MongoDB, MySQL, Redis (restore from backup if needed)
2. **Certificate Authority** — Regenerate or restore CA keys
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
| **Backup restoration test** | Weekly | Full database restore + query validation |
| **Certificate expiry simulation** | Quarterly | Auto-renewal completes without manual intervention |
| **Tabletop exercise** | Annual | All stakeholders execute response within RTO |
| **Full recovery drill** | Annual | Complete platform recovery within 4 hours |
| **Plan review** | Annual | All service dependencies and RTO/RPO targets verified |

## 8. Cross-References

| Document | Relevance |
|---|---|
| [Incident Response Policy](incident-response-policy.md) | L1-L4 incident classification and response |
| `docs/operations/runbook-database-failover.md` | Technical database failover procedure |
| `docs/operations/runbook-service-down.md` | Single service recovery procedure |
| `docs/operations/runbook-ca-compromise.md` | CA key compromise response |
| `docs/operations/runbook-certificate-expiry.md` | Certificate expiry runbook |
| `docs/operations/runbook-data-corruption.md` | Data corruption recovery |
| `docs/operations/runbook-message-bus-outage.md` | Redis/message-manager recovery |
| `docs/operations/runbook-deployment-failure.md` | Deployment failure recovery |
| `docs/deployment/BACKUP_DR.md` | Technical backup and DR configuration |
| `docs/deployment/DATABASE.md` | Database setup and replication |
| `docs/deployment/DOCKER.md` | Container orchestration |
| `docs/deployment/KUBERNETES.md` | K8s deployment and scaling |
| `scripts/` | Automation scripts for recovery operations |
