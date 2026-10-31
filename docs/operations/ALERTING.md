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
| `HighMemoryUsage` | heap above 90% of the V8 limit (`nodejs_heap_size_limit_bytes`), not of the allocated heap | — |

The first run of these rules on a healthy-looking compose stack (2026-10-28)
caught two incidents nobody had seen: the broker-message subscriber endpoint
never answered (every delivery to trader-trainer timed out, was retried 10
times and dead-lettered: ~1/3 of the market data), and message-manager
ignored `DLQ_LOCAL_FALLBACK_PATH` (in K8s the dead letters were written to the
read-only root filesystem: lost). Both are fixed.

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
- `scripts/observability-gate.mjs` keeps compose and K8s identical (rules and
  Alertmanager config), checks that every metric a rule reads is emitted, and
  refuses inline receiver credentials.
