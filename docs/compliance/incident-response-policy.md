# Incident Response Policy

> **Version:** 1.0  
> **Effective:** 2026-06  
> **Review:** Annual (tabletop exercise)  
> **Regulatory alignment:** GDPR Art. 33, DORA Art. 9-10, NIST SP 800-61 Rev. 2

## 1. Policy Statement

All security and operational incidents affecting the trading-model platform shall be detected, reported, investigated, and remediated in a timely manner. This policy defines the incident classification, response procedures, escalation paths, and regulatory notification requirements.

## 2. Incident Classification

| Level | Severity | Definition | Examples | Response Time |
|---|---|---|---|---|
| **L1** | Critical | Compromise of cryptographic keys, persistent unauthorised access, or extended platform outage | SPIRE CA key compromise, full platform DoS, database exfiltration | Immediate (≤ 15 min) |
| **L2** | High | Service degradation, data integrity concern, or potential unauthorised access | SVID compromise, audit-logger failure, persistent message loss | ≤ 1 hour |
| **L3** | Medium | Isolated service failure, configuration error, or limited data loss | Single service crash, DLQ overflow, rate limit bypass | ≤ 4 hours |
| **L4** | Low | Minor misconfiguration, alert noise, or non-security operational issue | Stale SVID warning, minor log formatting issue | ≤ 24 hours |

## 3. Incident Response Lifecycle

```
Detection → Triage → Containment → Eradication → Recovery → Post-Mortem
     │          │           │             │           │             │
     ▼          ▼           ▼             ▼           ▼             ▼
  Automated   Manual     Isolate      Remove      Restore       Lessons
  alerts     assess      service      root cause  service       learned
```

### 3.1 Detection

| Detection Method | Tools | Description |
|---|---|---|
| **Automated alerts** | Prometheus + Alertmanager, Grafana | Anomaly detection, threshold-based alerts (CPU, memory, error rates) |
| **Health checks** | Kubernetes liveness/readiness probes, service health endpoints | `/health` endpoint on every service |
| **Audit gap detection** | Audit-logger | Missing heartbeat events trigger gap detection |
| **SVID rotation / trust bundle update** | SPIRE + spiffe-helper sidecars | SVID rotation propagates via the Workload API |
| **Log monitoring** | Loki + Promtail | Structured log aggregation and querying |

### 3.2 Triage

Upon incident detection, the on-call engineer shall:

1. **Acknowledge** the alert within the response time
2. **Assess** the severity level using the classification table (§2)
3. **Document** initial findings in a new incident ticket with correlation ID
4. **Escalate** to Platform Security Lead for L1-L2 incidents
5. **Decide** containment strategy

### 3.3 Containment

| Incident Type | Containment Strategy |
|---|---|
| **SVID / trust compromise** | Re-register workloads via SPIRE, rotate trust bundle. Scale compromised instance to zero. Rotate affected keys |
| **Service misconfiguration** | Rollback to last known good configuration. Halt deployment pipeline |
| **Data integrity issue** | Stop affected service. Restore from backup. Initiate data validation |
| **Unauthorised access** | Revoke all session tokens. Rotate affected credentials. Isolate service network |
| **DoS / resource exhaustion** | Scale up. Enable rate limiting. Block offending source IPs |

### 3.4 Eradication & Recovery

1. Identify and permanently remove root cause
2. Apply security patches or configuration fixes
3. Restore service from backup if required
4. Verify fix with CI/CD pipeline (lint → build → test → security scan)
5. Gradually restore service traffic (canary deployment if applicable)
6. Re-run health checks and verify monitoring metrics normalised

### 3.5 Post-Mortem

Within 5 business days of L1-L2 incidents, a post-mortem document shall be produced containing:

- Root cause analysis
- Timeline of events (detection → containment → recovery)
- Effectiveness of response
- Remediation actions with owners and deadlines
- Updates to runbooks, monitoring, or alerting

Post-mortems are stored in `docs/operations/post-mortems/`.

## 4. Regulatory Notification

| Regulation | Trigger | Notification Period | Notify |
|---|---|---|---|
| **GDPR Art. 33** | Personal data breach | 72 hours | Supervisory authority (CNIL) |
| **DORA Art. 10** | Major ICT incident | 24 hours | Competent authority (ACPR/ECB) |
| **MiFID II Art. 72** | Record-keeping failure | Immediate internal escalation | Compliance officer |

**Important:** The trading-model platform processes no personal data. GDPR Art. 33 notification is not expected to be triggered. However, the capability is documented for completeness.

### 4.1 Notification Template

For incidents requiring regulatory notification, the following information must be collected:

1. Incident correlation ID (from audit-logger)
2. Description of the incident (nature, scope, duration)
3. Categories of data potentially affected
4. Estimated number of records affected (if any)
5. Response actions taken
6. Contact details of the Platform Security Lead

## 5. Roles & Responsibilities

| Role | Responsibility |
|---|---|
| **On-Call Engineer** | First responder. Acknowledge, triage, contain L3-L4 incidents. Escalate L1-L2 |
| **Platform Security Lead** | Lead L1-L2 response. Coordinate containment. Handle regulatory notification |
| **DevOps Lead** | Infrastructure recovery, backup restoration, deployment rollback |
| **Lead Developer** | Code-level root cause analysis, patch development |
| **Compliance Officer** | Regulatory notification, incident documentation for audit |

## 6. Communication Plan

| Stakeholder | Communication Method | Timing |
|---|---|---|
| **Internal team** | Incident channel (Slack/Teams) | Immediate |
| **Platform Security Lead** | Phone (L1-L2) / Slack (L3-L4) | Within response time |
| **Regulatory authorities** | Formal notification | Per regulatory timeline |
| **Users (if any)** | Status page / email | After containment |

## 7. Incident Logging

All incidents are logged with the audit-logger for traceability and compliance:

```json
{
  "correlationId": "inc-20260615-001",
  "eventType": "INCIDENT_DETECTED",
  "severity": "HIGH",
  "affectedService": "discovery-server",
  "summary": "SVID renewal failure for discovery-server",
  "detectedAt": "2026-06-15T10:30:00Z",
  "containedAt": "2026-06-15T10:45:00Z",
  "resolvedAt": "2026-06-15T11:00:00Z",
  "actionTaken": "SPIRE entry reconciled and spiffe-helper restarted. Root cause: SPIRE agent connectivity issue."
}
```

## 8. Testing & Exercises

| Exercise Type | Frequency | Participants |
|---|---|---|
| **Tabletop exercise** | Annual | Platform Security Lead, DevOps Lead, Lead Developer |
| **Automated chaos testing** | Quarterly | CI/CD pipeline injects controlled failures |
| **Full recovery drill** | Annual | Complete platform recovery from backup |
| **Certificate expiry simulation** | Annual | Verify SVID auto-rotation and alerting |

## 9. Cross-References

| Document | Relevance |
|---|---|
| [Business Continuity Policy](business-continuity-policy.md) | Extended outage procedures, RTO/RPO targets |
| [Information Security Policy](information-security-policy.md) §11 | Security incident escalation |
| `docs/operations/runbook-*.md` | Technical runbooks by incident type |
| `docs/operations/incident-response.md` | Operations-level incident response detail |
| [Data Retention Policy](data-retention-policy.md) | Evidence preservation during investigations |
