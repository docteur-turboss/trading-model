# Alerting

How an incident reaches a person, and how that path is kept honest.

```
services /metrics ─┐
backup exporter ───┼─► Prometheus ── rules (observability/alerting.yml) ──► Alertmanager ──► Slack #alerts / #alerts-warning
Alertmanager ──────┤                                                                     ├─► PagerDuty (critical)
Prometheus itself ─┘                                                                     └─► dead man's switch (Watchdog, every minute)
```

## Configuration

| What | Where |
| --- | --- |
| Rules | `observability/alerting.yml`, copied into the K8s ConfigMap `prometheus-config` (`deploy/k8s/infra/prometheus.yaml`) |
| Routing | `observability/alertmanager.yml`, copied into the K8s ConfigMap `alertmanager-config` (`deploy/k8s/infra/alertmanager.yaml`) |
| Credentials, K8s | Secret `alertmanager-credentials` (keys `SLACK_WEBHOOK_URL`, `PAGERDUTY_ROUTING_KEY`, `DEADMAN_URL`), written by `deploy.yml` from the GitHub environment secrets `ALERTMANAGER_SLACK_WEBHOOK_URL`, `ALERTMANAGER_PAGERDUTY_ROUTING_KEY`, `ALERTMANAGER_DEADMAN_URL` |
| Credentials, compose | one file per key in `ALERTMANAGER_CREDENTIALS_DIR` (default `observability/alertmanager-credentials/`, git-ignored) |

Alertmanager reads the credential files when it sends, so a changed Secret
needs no restart. A production deploy fails without the Slack webhook and the
dead man's switch; staging only warns. Without a PagerDuty key, critical alerts
still reach Slack `#alerts` (they are routed to both).

### Dead man's switch

`Watchdog` always fires. Alertmanager sends it every minute to `DEADMAN_URL`, a
heartbeat check of an external service (healthchecks.io, Dead Man's Snitch,
Better Stack...) set to page when no heartbeat arrives for ~5 minutes. It is
the only alert that still works when Prometheus, Alertmanager, the cluster or
Slack is down: configure that external check to notify someone directly
(email, SMS, phone), not through this Alertmanager.

## Alerts on the alerting path

| Alert | Catches |
| --- | --- |
| `Watchdog` | the whole pipeline (through the external dead man's switch) |
| `AlertmanagerNotificationsFailing` | a receiver that rejects notifications (wrong webhook, missing PagerDuty key) |
| `PrometheusRuleEvaluationFailures` | a rule that cannot be evaluated |
| `ServiceDown` | a scrape target that is down, Alertmanager and Prometheus included |

## Business alerts that health checks miss

A service can answer `/health/ready` while doing nothing useful: from launch to
2026-10-26 the scraper tracked no symbol and nobody was told.

| Alert | Fires when | Runbook |
| --- | --- | --- |
| `MarketDataStale` | no candle persisted for 15 min, all scraper replicas together | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `TrainerMarketDataStale` | no candle reached the trainer for 15 min (`tt_market_data_received_total`) | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `MarketDataUnpublished` | persisted candles of a symbol have waited 15 min for the bus (`fs_unpublished_candles`): sent from MySQL once message-manager answers, the trainer lags meanwhile | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `ScrapeCyclesFailing` | more than half of the scrape cycles fail | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `MessageDeliveryLowSuccessRate` | less than 99.5% of the messages delivered (the rest dead-lettered) | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `MessagesDeadLettered` | message-manager gave up on messages: they are in dlq-service (`GET /dlq`) to inspect and replay | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `DeadLettersNotForwarded` | dead letters have waited 15 min in a message-manager pod's local file (`mm_dlq_fallback_pending`): dlq-service cannot take them; lost if the pod is deleted | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `DeadLettersRejected` | dlq-service refused dead letters for good (400, 413): they are in `DLQ_LOCAL_FALLBACK_PATH.rejected` | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `MessagesLost` | dlq-service could not take dead letters and the local file could not be written either: they are gone | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `AuditChainBroken` | audit-logger's verification found the audit chain broken: event changed, missing or removed, or a chain that no longer matches its anchors (ADR-0027) | [runbook-audit-chain-broken](runbooks/runbook-audit-chain-broken.md) |
| `AuditChainVerificationStale` / `AuditChainAnchoringStale` | no verification, or no anchor written, for 45 min | [runbook-audit-chain-broken](runbooks/runbook-audit-chain-broken.md) |
| `AuditChainNotAnchored` (warning) | no anchor store configured (`AUDIT_ANCHOR_BUCKET`): expected in compose and staging | [runbook-audit-chain-broken](runbooks/runbook-audit-chain-broken.md) |
| `HighMemoryUsage` | heap above 90% of the V8 limit (`nodejs_heap_size_limit_bytes`), not of the allocated heap | [runbook-service-down](runbooks/runbook-service-down.md#1-oomkilled-out-of-memory) |

The first run of these rules on a healthy-looking compose stack (2026-10-28)
caught two incidents nobody had seen: the broker-message subscriber endpoint
never answered (every delivery to trader-trainer timed out, was retried 10
times and dead-lettered: ~1/3 of the market data), and message-manager
ignored `DLQ_LOCAL_FALLBACK_PATH` (in K8s the dead letters were written to the
read-only root filesystem: lost). Both are fixed.

## Alert → runbook

Every rule carries `annotations.runbook_url`: the absolute GitHub URL, on
`main`, of its procedure (with the section anchor when the file covers several
alerts). Alertmanager passes it to Slack and PagerDuty, so the page links the
procedure. `scripts/observability-gate.mjs` fails on a rule without it, on a
file absent from the repository, or on an anchor that matches no heading.

| Alert | Severity | Runbook |
| --- | --- | --- |
| `SLOAvailabilityFastBurn` | critical | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `SLOAvailabilitySlowBurn` | warning | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `SLOLatencyFastBurn` | critical | [runbook-latency-and-errors#highlatency](runbooks/runbook-latency-and-errors.md#highlatency) |
| `SLOLatencySlowBurn` | warning | [runbook-latency-and-errors#highlatency](runbooks/runbook-latency-and-errors.md#highlatency) |
| `SLOErrorRateFastBurn` | critical | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `SLOErrorRateSlowBurn` | warning | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `ServiceDown` | critical | [runbook-service-down](runbooks/runbook-service-down.md) |
| `HighErrorRate` | warning | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `HighLatency` | warning | [runbook-latency-and-errors#highlatency](runbooks/runbook-latency-and-errors.md#highlatency) |
| `CertificateExpiry` | warning | [runbook-certificate-expiry](runbooks/runbook-certificate-expiry.md) |
| `CircuitBreakerOpen` | critical | [runbook-circuit-breaker-open](runbooks/runbook-circuit-breaker-open.md) |
| `DLQSizeGrowing` | warning | [runbook-dlq-backlog](runbooks/runbook-dlq-backlog.md) |
| `InstanceCountLow` | critical | [runbook-discovery#instancecountlow](runbooks/runbook-discovery.md#instancecountlow) |
| `HighMemoryUsage` | warning | [runbook-service-down#1-oomkilled-out-of-memory](runbooks/runbook-service-down.md#1-oomkilled-out-of-memory) |
| `HeartbeatStopped` | critical | [runbook-discovery#heartbeatstopped](runbooks/runbook-discovery.md#heartbeatstopped) |
| `BackupFailed` | critical | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupNotRunning` | warning | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupJobStale` | critical | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupIncrementalStale` | critical | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupIncrementalMissing` | critical | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupIncrementalFailed` | warning | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupPitrGap` | critical | [BACKUP_DR#point-in-time-chain-broken](../deployment/BACKUP_DR.md#point-in-time-chain-broken) |
| `BackupMetricsAbsent` | critical | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupComponentMissing` | critical | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupUnencrypted` | critical | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupOffsiteCopyFailed` | critical | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `BackupVolumeFilling` | warning | [BACKUP_DR#monitoring](../deployment/BACKUP_DR.md#monitoring) |
| `AuditChainBroken` | critical | [runbook-audit-chain-broken#auditchainbroken](runbooks/runbook-audit-chain-broken.md#auditchainbroken) |
| `AuditChainVerificationStale` | critical | [runbook-audit-chain-broken#auditchainverificationstale](runbooks/runbook-audit-chain-broken.md#auditchainverificationstale) |
| `AuditChainAnchoringStale` | critical | [runbook-audit-chain-broken#auditchainanchoringstale](runbooks/runbook-audit-chain-broken.md#auditchainanchoringstale) |
| `AuditChainNotAnchored` | warning | [runbook-audit-chain-broken#auditchainnotanchored](runbooks/runbook-audit-chain-broken.md#auditchainnotanchored) |
| `MessageDeliveryLowSuccessRate` | critical | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `MessagesLost` | critical | [runbook-message-bus-outage#4-dead-letters-stuck-refused-or-lost](runbooks/runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost) |
| `MessagesDeadLettered` | warning | [runbook-message-bus-outage#4-dead-letters-stuck-refused-or-lost](runbooks/runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost) |
| `DeadLettersNotForwarded` | warning | [runbook-message-bus-outage#4-dead-letters-stuck-refused-or-lost](runbooks/runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost) |
| `DeadLettersRejected` | warning | [runbook-message-bus-outage#4-dead-letters-stuck-refused-or-lost](runbooks/runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost) |
| `MessagesUnrouted` | warning | [runbook-message-bus-outage#3-no-subscriber-on-a-topic](runbooks/runbook-message-bus-outage.md#3-no-subscriber-on-a-topic) |
| `DLQDrainRateLow` | warning | [runbook-dlq-backlog](runbooks/runbook-dlq-backlog.md) |
| `TrainingCompletionRateLow` | warning | [runbook-trainer#trainingcompletionratelow](runbooks/runbook-trainer.md#trainingcompletionratelow) |
| `MarketDataStale` | critical | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `ScrapeCyclesFailing` | warning | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `BinanceRestrictedLocation` | critical | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `MarketDataUnpublished` | warning | [runbook-message-bus-outage#5-scraper-publish-backlog](runbooks/runbook-message-bus-outage.md#5-scraper-publish-backlog) |
| `TrainerMarketDataStale` | critical | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `ModelArtifactWriteFailing` | warning | [runbook-trainer#modelartifactwritefailing](runbooks/runbook-trainer.md#modelartifactwritefailing) |
| `AlertmanagerNotificationsFailing` | critical | [ALERTING#alerts-on-the-alerting-path](ALERTING.md#alerts-on-the-alerting-path) |
| `PrometheusRuleEvaluationFailures` | critical | [ALERTING#alerts-on-the-alerting-path](ALERTING.md#alerts-on-the-alerting-path) |
| `Watchdog` | none | [ALERTING#dead-mans-switch](ALERTING.md#dead-mans-switch) |

## Writing a rule

- Aggregate before dividing: `sum by (job) (rate(errors[5m])) / sum by (job) (rate(all[5m]))`.
  Dividing raw series matches each 5xx series with itself and reports 100%
  on a single error.
- A ratio whose numerator may not exist (no success yet, nothing published)
  needs `(numerator or denominator * 0)`, otherwise it never fires.
- `histogram_quantile` needs `sum by (job, le)` and never returns more than the
  largest finite bucket: the HTTP histogram goes up to 30s.
- Every rule change goes with a case in `tests/alerts/alerting.test.yml`
  (`bash tests/alerts/run.sh`, CI job `observability`). The same tests fail on
  the rules as they were before 2026-10-28.
- Every rule has a `runbook_url` to a procedure of the repository (add a
  section to a runbook, or a new runbook in `runbooks/`, in the same change),
  and a line in the table above.
- `scripts/observability-gate.mjs` keeps compose and K8s identical (rules with
  their annotations, and Alertmanager config), checks that every metric a rule
  reads is emitted and that every `runbook_url` leads to an existing file and
  heading, and refuses inline receiver credentials.
