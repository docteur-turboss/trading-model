# Incident Response

Operational checklist. Severity levels (L1 to L4), the response lifecycle, roles and the regulatory notifications (GDPR 72 h, DORA, MiFID II) are defined once, in the [Incident Response Policy](../compliance/incident-response-policy.md): assess the level with its §2 table, and follow its §4 when personal or regulated data is involved (record every personal data breach in the [breach register](../compliance/breach-register.md)).

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

- **L1/L2:** Immediately rollback if caused by recent deployment
- **L1:** Restore from backup if data loss
- **L1:** Isolate affected service if cascading failure
- Document all actions in the incident timeline (no dedicated channel: see [Communication Channels](#communication-channels))

### 4. Resolution

- Apply fix or mitigation
- Verify service health via:
  - Health check passes, run inside the container with its SVID (mTLS rejects a bare `curl`): see [Health check endpoints](on-call.md#health-check-endpoints)
  - Prometheus alert resolves
  - E2E smoke tests pass

### 5. Post-Mortem (policy §3.5)

- Root cause analysis
- Timeline of events
- What went well / what went wrong
- Action items with owners and deadlines

## Escalation Matrix

The project has a single maintainer, reachable best effort. No second
person, team or on-call tool exists: do not look for one.

| Step | Channel                                                                 | Expected response                                            |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | Pushover push for every `critical` alert (`deploy/k8s/infra/config/alertmanager.yml`) | Best effort; no automatic escalation if unacknowledged       |
| 2    | Dead man's switch (`Watchdog` alert, `DEADMAN_URL`): signals that alerting itself is down | Notification when the heartbeat stops               |
| 3    | Security incident: follow the private reporting procedure in [SECURITY.md](../../SECURITY.md) | Acknowledgement within 72 hours (SECURITY.md)   |

Realistic delay: minutes to a few hours during the day, possibly none at night
(no 24/7 cover). The owner chose not to name a backup person or use a paging
tool with automatic escalation: covered hours, the off-hours reaction target and
the data losses accepted are in [slo.md](slo.md#outside-working-hours).
Contact details are never committed (public repository).

## Communication Channels

Only channels defined in `deploy/k8s/infra/config/alertmanager.yml` (see [ALERTING.md](ALERTING.md)):

| Channel          | Purpose                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `#alerts`        | Critical alerts (also paged) and default receiver                |
| `#alerts-warning`| Warning alerts                                                   |
| Pushover         | Critical alerts, emergency priority (repeats until acknowledged) |
| Dead man's switch| `Watchdog` heartbeat (`DEADMAN_URL`): silence means alerting is down |

No incident-coordination channel or on-call phone is defined in the repo: the owner picks one per incident and records it in the post-mortem.

## Post-Incident Checklist

- [ ] Post-mortem written (policy §3.5: within 5 business days for L1-L2)
- [ ] Root cause identified and fixed
- [ ] Monitoring improved to detect recurrence
- [ ] Runbook updated if gaps found
- [ ] Action items tracked with owners
- [ ] Regulatory notification assessed (policy §4)
