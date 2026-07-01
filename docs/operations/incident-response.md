# Incident Response

## Severity Levels

| Severity | Definition | Response Time | Escalation |
|----------|------------|---------------|------------|
| **SEV1** | Complete service outage, data loss, security breach | 15 min | Engineering Manager + CTO |
| **SEV2** | Partial outage, degraded performance, feature unavailable | 1 hour | Engineering Manager |
| **SEV3** | Minor issue, cosmetic bug, non-critical alert | 8 hours | On-call engineer |
| **SEV4** | Question, enhancement, low-priority | Next business day | Team lead |

## Incident Response Process

### 1. Detection
- Automated alert from Prometheus/Alertmanager
- User report through support channel
- Monitoring dashboard anomaly
- Manual observation

### 2. Triage (first 5 minutes)
```
Who is affected?        → All users / subset / internal only
What is the impact?     → Data loss / downtime / degraded perf
What service is down?   → [service name]
Is there a known cause? → Recent deploy / config change / upstream outage
```

### 3. Mitigation (first 15 minutes)
- **SEV1/SEV2:** Immediately rollback if caused by recent deployment
- **SEV1:** Restore from backup if data loss
- **SEV1:** Isolate affected service if cascading failure
- Document all actions in the incident channel

### 4. Resolution
- Apply fix or mitigation
- Verify service health via:
  - `GET /ping` returns 200
  - `GET /health` returns healthy
  - Prometheus alert resolves
  - E2E smoke tests pass

### 5. Post-Mortem (within 48 hours)
- Root cause analysis
- Timeline of events
- What went well / what went wrong
- Action items with owners and deadlines

## Escalation Matrix

| Role | Name | Contact | Hours |
|------|------|---------|-------|
| On-call Engineer | PagerDuty `trading-model-oncall` | PagerDuty / #incidents Slack | 24/7 |
| Engineering Manager | `@trading-model/core` team lead | #incidents Slack / Phone | Business hours + escalation |
| Security Lead | `@trading-model/security` | security@trading-model.example.com | 24/7 for security incidents |
| CTO | cto@trading-model.example.com | Phone / #incidents | SEV1 escalation |

## Communication Channels

| Channel | Purpose |
|---------|---------|
| #incidents | SEV1/SEV2 coordination |
| #alerts | Automated alert notifications |
| #ops | Operational discussions |
| On-call Phone | Twilio Flex / PagerDuty |

## Post-Incident Checklist

- [ ] Incident documented in post-mortem
- [ ] Root cause identified and fixed
- [ ] Monitoring improved to detect recurrence
- [ ] Runbook updated if gaps found
- [ ] Action items tracked with owners
- [ ] Stakeholders notified

## Regulatory Breach Notification

This section applies when a security incident involves:
- Unauthorized access to or disclosure of secrets (CA keys, service tokens, HMAC secrets)
- Data integrity compromise (audit log tampering, message forgery)
- Any incident that could trigger regulatory notification obligations

### GDPR — Personal Data Breach Notification (Art. 33-34)

The trading-model platform processes **no personal data** under normal operation.
However, if a breach incident is confirmed to involve personal data:

| Requirement | Detail |
|-------------|--------|
| **Notification deadline** | 72 hours from discovery (Art. 33 GDPR) |
| **Notify** | Competent Supervisory Authority (see below) |
| **Template** | `docs/compliance/breach-notification-template.md` |
| **Content** | Nature of breach, categories of data, number of records, DPO contact, likely consequences, measures taken |
| **Data subject notice** | Required if high risk to rights/freedoms (Art. 34) — "without undue delay" |

### Financial Regulatory Reporting

If the system processes financial transactions subject to regulation:

| Regulation | Authority | Reporting Obligation |
|------------|-----------|---------------------|
| **MiFID II** (EU) | AMF (France) / BaFin (Germany) / FCA (UK) | Incident reporting to competent authority |
| **MAR** (EU) | ESMA / National authority | Suspicious transaction/order reporting |
| **Dodd-Frank** (US) | CFTC / SEC | Swap data reporting, whistleblower provisions |

### Notification Authorities

| Jurisdiction | Authority | Contact | Deadline |
|-------------|-----------|---------|----------|
| France | CNIL | https://www.cnil.fr/fr/notifier-une-violation-de-donnees | 72h |
| France (financial) | AMF | https://www.amf-france.org | Per regulation |
| Germany | BfDI | https://www.bfdi.bund.de | 72h |
| UK | ICO | https://ico.org.uk | 72h |
| EU (financial) | ESMA | https://www.esma.europa.eu | Per regulation |

### Breach Notification Workflow

```
1. DETECTION → Security incident identified (SEV1)
2. ASSESSMENT → Does it involve personal data or regulatory data?
   ├─ NO → Standard incident response (no regulatory notification)
   └─ YES → CONTINUE
3. CONTAINMENT → Isolate affected services
4. NOTIFICATION → Within 72 hours:
   a. Prepare notification using template
   b. Legal/DPO review
   c. Submit to authority
5. DATA SUBJECTS → Notify if high risk (Art. 34)
6. DOCUMENTATION → Record all actions, timeline, and decisions
7. POST-MORTEM → Complete within 48 hours of resolution
```

### Breach Notification Content Checklist

- [ ] Nature of the personal data breach
- [ ] Categories and approximate number of data subjects
- [ ] Categories and approximate number of personal data records
- [ ] Name and contact details of DPO or contact point
- [ ] Likely consequences of the breach
- [ ] Measures taken or proposed to address the breach
- [ ] Measures to mitigate possible adverse effects
