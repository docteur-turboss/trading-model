# Alerting

How an incident reaches a person, and how that path is kept honest.

```
services /metrics ─┐
backup exporter ───┼─► Prometheus ── rules (observability/alerting.yml) ──► Alertmanager ──► Slack #alerts / #alerts-warning
Alertmanager ──────┤                                                                     ├─► Pushover (critical)
Prometheus itself ─┘                                                                     └─► dead man's switch (Watchdog, every minute)
```

## Configuration

| What | Where |
| --- | --- |
| Rules | `observability/alerting.yml`, copied into the K8s ConfigMap `prometheus-config` (`deploy/k8s/infra/prometheus.yaml`) |
| Routing | `observability/alertmanager.yml`, copied into the K8s ConfigMap `alertmanager-config` (`deploy/k8s/infra/alertmanager.yaml`) |
| Credentials, K8s | Secret `alertmanager-credentials` (keys `SLACK_WEBHOOK_URL`, `PUSHOVER_USER_KEY`, `PUSHOVER_TOKEN`, `DEADMAN_URL`), written by `deploy.yml` from the GitHub environment secrets `ALERTMANAGER_SLACK_WEBHOOK_URL`, `ALERTMANAGER_PUSHOVER_USER_KEY`, `ALERTMANAGER_PUSHOVER_TOKEN`, `ALERTMANAGER_DEADMAN_URL` |
| Credentials, compose | one file per key in `ALERTMANAGER_CREDENTIALS_DIR` (default `observability/alertmanager-credentials/`, git-ignored) |

Alertmanager reads the credential files when it sends, so a changed Secret
needs no restart. A deploy of staging or production fails at its first step
("Check alert notification secrets") and lists every missing one of the four
secrets `ALERTMANAGER_SLACK_WEBHOOK_URL`, `ALERTMANAGER_DEADMAN_URL`,
`ALERTMANAGER_PUSHOVER_USER_KEY`, `ALERTMANAGER_PUSHOVER_TOKEN`: a receiver
reading an absent file fails each notification and fires
`AlertmanagerNotificationsFailing`. Pushover is required too, so a real Pushover
outage in production is never masked by a skipped receiver.

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
| `AlertmanagerNotificationsFailing` | a receiver that rejects notifications (wrong webhook, missing Pushover key): at least 50 % of an integration's attempts failed over 15 min. One transient failure (DNS timeout) retried by the next send does not fire; an integration with no traffic does not fire |
| `PrometheusRuleEvaluationFailures` | a rule that cannot be evaluated |
| `ServiceDown` | a scrape target that is down, Alertmanager and Prometheus included |
| `ServiceTargetsMissing` | an application service with no `up` series at all (0 replicas, Pending pods, broken scrape config), which `up == 0` cannot see |

Dead man's switch margin: `Watchdog` is re-sent every minute (`repeat_interval: 1m`), so an isolated failed send is made up the next minute. Configure the heartbeat service with a 1 min period and a grace period of at least 10 min, or one transient failure pages as a false positive.

## High availability (production)

ADR-0062: production runs Prometheus ×2 and Alertmanager ×2 (cluster on port 9094), so a drain or a release does not stop evaluation or notifications. Check: `kubectl exec alertmanager-0 -- wget -qO- localhost:9093/api/v2/status` shows `cluster.status: ready` and 2 peers. Grafana, Loki, Jaeger, blackbox-exporter and kube-state-metrics stay at one replica (consultation or a missed scrape, not detection). Deduplication relies on `alert_relabel_configs` dropping the `replica` label (expanded by `--enable-feature=expand-external-labels`): both Prometheus send identical alerts to every ready pod (Service `alertmanager-ready`). Staging runs 1 of each.

## Loki and the trace pipeline

K8s retention is bounded like the compose: Loki's compactor deletes logs older
than 744 h (31 days), Jaeger keeps traces 72 h on its PVC (Badger), and the
OTel collector refuses data (`memory_limiter`) before an OOM kill. Observability
data is not backed up (`BACKUP_DR.md`).

| Alert | Fires when | What to do |
| --- | --- | --- |
| `LokiPushFailing` | Loki answers 5xx on push or discards samples for 10 min | `kubectl logs sts/loki`; `kubectl exec sts/loki -- df -h /loki` (full PVC: check `LokiRetentionStale`) |
| `LokiRetentionStale` | the compactor has not applied retention for 3 h | `kubectl logs sts/loki`, look for compactor errors; the PVC drains at the next successful run |

`LokiRetentionStale` has no `absent()` twin: if Loki is down or the compactor
metric disappears, the expression is empty and the alert stays silent. A down
Loki is already reported by `ServiceDown`.

The PVC fill ratio (`kubelet_volume_stats_*`) is not alerted: the kubelet is
not scraped yet, only Loki's own metrics are.

### OtelSpanExportFailing

The collector (K8s only; compose exports straight to Jaeger, so the rule stays
silent there) reports `otelcol_exporter_send_failed_spans` on `:8888`. Spans
are being dropped between collector and Jaeger.

1. `kubectl logs deploy/otel-collector`: look for export errors to `jaeger:4317`.
2. Check the `jaeger` Service has ready endpoints.
3. Once Jaeger answers, the alert clears after 10 minutes; dropped spans are not replayed.

## Business alerts that health checks miss

A service can answer `/health/ready` while doing nothing useful: from launch to
2026-10-26 the scraper tracked no symbol and nobody was told.

| Alert | Fires when | Runbook |
| --- | --- | --- |
| `CollectorNoLeader` | no scraper pod reports `fs_collector_leader` = 1 for 2 min: no collector holds the Lease, nothing is collected (ADR-0057) | [runbook-market-data-stale#collectornoleader](runbooks/runbook-market-data-stale.md#collectornoleader) |
| `MarketDataStale` | no candle persisted for 15 min, all scraper replicas together | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `TrainerNoLeader` | no trainer pod reports `tt_training_leader` = 1 for 5 min: no trainer holds the Lease, nothing is trained (ADR-0058); the read routes still answer | [runbook-trainer#trainernoleader](runbooks/runbook-trainer.md#trainernoleader) |
| `TrainerNoLeaderProlonged` | `critical` (page): same condition as `TrainerNoLeader` for 30 min, far beyond a rollout handover (end of a generation plus a few seconds) | [runbook-trainer#trainernoleader](runbooks/runbook-trainer.md#trainernoleader) |
| `TrainerNoModelStored` | a trainer holds the Lease but no model was stored (`tt_model_artifacts_total{result="stored"}`) for 5 h (2 h after a start), whatever the cause: sessions failing, nothing trained, writes failing | [runbook-trainer#trainernomodelstored](runbooks/runbook-trainer.md#trainernomodelstored) |
| `TrainerMarketDataStale` | no candle reached the trainer for 15 min (`tt_market_data_received_total`) | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `ModelBelowBuyAndHold` | the last 3 stored models of a symbol have an out-of-sample Sharpe below buy and hold on the same bars (`tt_model_below_buy_and_hold_streak`, Lease holder only; `segment="test"`, ADR-0068) | [runbook-trainer#modelbelowbuyandhold](runbooks/runbook-trainer.md#modelbelowbuyandhold) |
| `TrainerFeatureDrift` | for 1 h, a normalized field of a symbol received since its newest stored model has a mean more than 3 standard deviations from the statistics stored with that model (`tt_feature_drift_score`) | [runbook-trainer#trainerfeaturedrift](runbooks/runbook-trainer.md#trainerfeaturedrift) |
| `MarketDataUnpublished` | persisted candles of a symbol have waited 15 min for the bus (`fs_unpublished_candles`): sent from MySQL once message-manager answers, the trainer lags meanwhile | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `ScrapeCyclesFailing` | more than half of the scrape cycles fail | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `SymbolMarketDataStale` | no candle of one symbol persisted for 15 min while the others may still flow (`fs_candles_persisted_total{symbol}`): symbol rejected, klines failing or candles refused by the normalizer, by symbol | [runbook-market-data-stale#symbolmarketdatastale](runbooks/runbook-market-data-stale.md#symbolmarketdatastale) |
| `SignalCollectionFailing` | a signal source (ADR-0036) failed a collection in the last 24 h, by source: fetch error (403 from SEC EDGAR without contact e-mail), changed format or MySQL | [runbook-market-data-stale#signalcollectionfailing](runbooks/runbook-market-data-stale.md#signalcollectionfailing) |
| `CandleDeliveryLagging` | under 50% of the candles persisted by the scraper reached the trainer over 30 min, for 15 min (data freshness SLO, `slo.md`) | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `MessageDeliveryLowSuccessRate` | less than 99.5% of the messages delivered (the rest dead-lettered) | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `MessagesDeadLettered` | message-manager gave up on messages: they are in dlq-service (`GET /dlq`) to inspect and replay | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `DeadLettersRejected` | dlq-service refused dead letters for good (400, 413): their journal entries stay pending until trimmed after 24 h | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `DlqAuditEventLost` | a DLQ delete or replay was done but message-manager refused its audit event (`dlq_audit_publish_failures_total`): not in the audit chain, the API answered 502 (ADR-0059) | [runbook-dlq-backlog#dlqauditeventlost](runbooks/runbook-dlq-backlog.md#dlqauditeventlost) |
| `RetentionFailed` | warning | [BACKUP_DR#retention-job](../deployment/BACKUP_DR.md#retention-job) |
| `RetentionStale` | warning | [BACKUP_DR#retention-job](../deployment/BACKUP_DR.md#retention-job) |
| `ApiAuthFailuresHigh` | the gateway rejected API keys at more than 0.1/s (6/min) for 5 min | [runbook-auth-failures](runbooks/runbook-auth-failures.md) |
| `MtlsAclDenials` | any mTLS or ACL denial on a service (`http_mtls_denials_total`) | [runbook-auth-failures](runbooks/runbook-auth-failures.md) |
| `AuditChainBroken` | audit-logger's verification found the audit chain broken: event changed, missing or removed, or a chain that no longer matches its anchors (ADR-0027) | [runbook-audit-chain-broken](runbooks/runbook-audit-chain-broken.md) |
| `AuditChainVerificationStale` / `AuditChainAnchoringStale` | no verification, or no anchor written, for 45 min | [runbook-audit-chain-broken](runbooks/runbook-audit-chain-broken.md) |
| `AuditChainNotAnchored` (warning) | no anchor store configured (`AUDIT_ANCHOR_BUCKET`): expected in compose and staging | [runbook-audit-chain-broken](runbooks/runbook-audit-chain-broken.md) |
| `HighMemoryUsage` | heap above 90% of the V8 limit (`nodejs_heap_size_limit_bytes`), not of the allocated heap | [runbook-service-down](runbooks/runbook-service-down.md#1-oomkilled-out-of-memory) |

The first run of these rules on a healthy-looking compose stack (2026-10-28)
caught two incidents nobody had seen: the broker-message subscriber endpoint
never answered (every delivery to trader-trainer timed out, was retried 10
times and dead-lettered: ~1/3 of the market data), and message-manager
ignored its dead-letter file path (in K8s the dead letters were written to the
read-only root filesystem: lost). Both are fixed (the file is gone since #910).

## Alert → runbook

Every rule carries `annotations.runbook_url`: the absolute GitHub URL, on
`main`, of its procedure (with the section anchor when the file covers several
alerts). Alertmanager passes it to Slack and Pushover, so the page links the
procedure. `scripts/observability-gate.mjs` fails on a rule without it, on a
file absent from the repository, or on an anchor that matches no heading.

| Alert | Severity | Runbook |
| --- | --- | --- |
| `SLOAvailabilityFastBurn` | critical | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `SLOAvailabilitySlowBurn` | warning | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `SLOLatencyFastBurn` | critical | [runbook-latency-and-errors#slolatencyfastburn](runbooks/runbook-latency-and-errors.md#slolatencyfastburn) |
| `SLOLatencySlowBurn` | warning | [runbook-latency-and-errors#slolatencyfastburn](runbooks/runbook-latency-and-errors.md#slolatencyfastburn) |
| `SLOErrorRateFastBurn` | critical | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `SLOErrorRateSlowBurn` | warning | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `SLOErrorBudgetLow` | warning | [runbook-latency-and-errors#slo-error-budget-low](runbooks/runbook-latency-and-errors.md#slo-error-budget-low) |
| `ServiceDown` | critical | [runbook-service-down](runbooks/runbook-service-down.md) |
| `ServiceTargetsMissing` | critical | [runbook-service-down#no-scrape-target](runbooks/runbook-service-down.md#no-scrape-target) |
| `HighErrorRate` | warning | [runbook-latency-and-errors#higherrorrate](runbooks/runbook-latency-and-errors.md#higherrorrate) |
| `CertificateExpiry` | warning | [runbook-certificate-expiry](runbooks/runbook-certificate-expiry.md) |
| `CircuitBreakerOpen` | critical | [runbook-circuit-breaker-open](runbooks/runbook-circuit-breaker-open.md) |
| `HttpCircuitBreakerRejecting` | warning | [runbook-circuit-breaker-open#symptom](runbooks/runbook-circuit-breaker-open.md#symptom) |
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
| `ApiAuthFailuresHigh` | warning | [runbook-auth-failures#apiauthfailureshigh](runbooks/runbook-auth-failures.md#apiauthfailureshigh) |
| `MtlsAclDenials` | warning | [runbook-auth-failures#mtlsacldenials](runbooks/runbook-auth-failures.md#mtlsacldenials) |
| `AuditChainBroken` | critical | [runbook-audit-chain-broken#auditchainbroken](runbooks/runbook-audit-chain-broken.md#auditchainbroken) |
| `AuditChainVerificationStale` | critical | [runbook-audit-chain-broken#auditchainverificationstale](runbooks/runbook-audit-chain-broken.md#auditchainverificationstale) |
| `AuditChainAnchoringStale` | critical | [runbook-audit-chain-broken#auditchainanchoringstale](runbooks/runbook-audit-chain-broken.md#auditchainanchoringstale) |
| `AuditChainNotAnchored` | warning | [runbook-audit-chain-broken#auditchainnotanchored](runbooks/runbook-audit-chain-broken.md#auditchainnotanchored) |
| `MessageDeliveryLowSuccessRate` | critical | [runbook-message-bus-outage](runbooks/runbook-message-bus-outage.md) |
| `DlqAuditEventLost` | critical | [runbook-dlq-backlog#dlqauditeventlost](runbooks/runbook-dlq-backlog.md#dlqauditeventlost) |
| `MessagesDeadLettered` | warning | [runbook-message-bus-outage#4-dead-letters-stuck-refused-or-lost](runbooks/runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost) |
| `DeadLettersRejected` | warning | [runbook-message-bus-outage#4-dead-letters-stuck-refused-or-lost](runbooks/runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost) |
| `MessagesUnrouted` | warning | [runbook-message-bus-outage#3-no-subscriber-on-a-topic](runbooks/runbook-message-bus-outage.md#3-no-subscriber-on-a-topic) |
| `JournalEntriesTrimmed` | critical | [runbook-message-bus-outage#6-journal-entries-trimmed-before-delivery](runbooks/runbook-message-bus-outage.md#6-journal-entries-trimmed-before-delivery) |
| `JournalBacklogOld` | warning | [runbook-message-bus-outage#7-journal-backlog-of-a-subscriber](runbooks/runbook-message-bus-outage.md#7-journal-backlog-of-a-subscriber) |
| `DLQDrainRateLow` | warning | [runbook-dlq-backlog](runbooks/runbook-dlq-backlog.md) |
| `TrainingCompletionRateLow` | warning | [runbook-trainer#trainingcompletionratelow](runbooks/runbook-trainer.md#trainingcompletionratelow) |
| `TrainingCompletionRateCritical` | critical | [runbook-trainer#trainingcompletionratelow](runbooks/runbook-trainer.md#trainingcompletionratelow) |
| `TrainerEventLoopBlocked` | warning | [runbook-trainer#trainereventloopblocked](runbooks/runbook-trainer.md#trainereventloopblocked) |
| `TrainerEventLoopLagHigh` | warning | [runbook-trainer#trainereventlooplaghigh](runbooks/runbook-trainer.md#trainereventlooplaghigh) |
| `TrainerNoLeader` | warning | [runbook-trainer#trainernoleader](runbooks/runbook-trainer.md#trainernoleader) |
| `TrainerNoLeaderProlonged` | critical | [runbook-trainer#trainernoleader](runbooks/runbook-trainer.md#trainernoleader) |
| `MarketDataStale` | critical | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `ScrapeCyclesFailing` | warning | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `SymbolMarketDataStale` | critical | [runbook-market-data-stale#symbolmarketdatastale](runbooks/runbook-market-data-stale.md#symbolmarketdatastale) |
| `BinanceRestrictedLocation` | critical | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `SignalCollectionFailing` | warning | [runbook-market-data-stale#signalcollectionfailing](runbooks/runbook-market-data-stale.md#signalcollectionfailing) |
| `MarketDataUnpublished` | warning | [runbook-message-bus-outage#5-scraper-publish-backlog](runbooks/runbook-message-bus-outage.md#5-scraper-publish-backlog) |
| `TrainerMarketDataStale` | critical | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `CandleDeliveryLagging` | warning | [runbook-market-data-stale](runbooks/runbook-market-data-stale.md) |
| `TrainerNoModelStored` | critical | [runbook-trainer#trainernomodelstored](runbooks/runbook-trainer.md#trainernomodelstored) |
| `ModelArtifactWriteFailing` | warning | [runbook-trainer#modelartifactwritefailing](runbooks/runbook-trainer.md#modelartifactwritefailing) |
| `ModelBelowBuyAndHold` | warning | [runbook-trainer#modelbelowbuyandhold](runbooks/runbook-trainer.md#modelbelowbuyandhold) |
| `TrainerFeatureDrift` | warning | [runbook-trainer#trainerfeaturedrift](runbooks/runbook-trainer.md#trainerfeaturedrift) |
| `KubePodCrashLooping` | warning | [runbook-infrastructure#kubepodcrashlooping](runbooks/runbook-infrastructure.md#kubepodcrashlooping) |
| `KubeContainerOOMKilled` | warning | [runbook-infrastructure#kubecontaineroomkilled](runbooks/runbook-infrastructure.md#kubecontaineroomkilled) |
| `KubePersistentVolumeFillingUp` | warning | [runbook-infrastructure#kubepersistentvolumefillingup](runbooks/runbook-infrastructure.md#kubepersistentvolumefillingup) |
| `NodeFilesystemAlmostFull` | warning | [runbook-infrastructure#nodefilesystemalmostfull](runbooks/runbook-infrastructure.md#nodefilesystemalmostfull) |
| `MySQLDown` | critical | [runbook-infrastructure#mysqldown](runbooks/runbook-infrastructure.md#mysqldown) |
| `RedisDown` | critical | [runbook-infrastructure#redisdown](runbooks/runbook-infrastructure.md#redisdown) |
| `RedisReplicasMissing` | warning | [runbook-infrastructure#redisreplicasmissing](runbooks/runbook-infrastructure.md#redisreplicasmissing) |
| `StatefulSetStuckOnOldRevision` | warning | [runbook-infrastructure#statefulsetstuckonoldrevision](runbooks/runbook-infrastructure.md#statefulsetstuckonoldrevision) |
| `RedisSentinelQuorumLost` | critical | [runbook-infrastructure#redissentinelquorumlost](runbooks/runbook-infrastructure.md#redissentinelquorumlost) |
| `MongoDBDown` | critical | [runbook-infrastructure#mongodbdown](runbooks/runbook-infrastructure.md#mongodbdown) |
| `MongoDBReplicaSetMemberUnhealthy` | warning | [runbook-infrastructure#mongodbreplicasetmemberunhealthy](runbooks/runbook-infrastructure.md#mongodbreplicasetmemberunhealthy) |
| `MongoDBReplicaSetNoPrimary` | critical | [runbook-infrastructure#mongodbreplicasetnoprimary](runbooks/runbook-infrastructure.md#mongodbreplicasetnoprimary) |
| `AlertmanagerNotificationsFailing` | critical | [ALERTING#alerts-on-the-alerting-path](ALERTING.md#alerts-on-the-alerting-path) |
| `PrometheusRuleEvaluationFailures` | critical | [ALERTING#alerts-on-the-alerting-path](ALERTING.md#alerts-on-the-alerting-path) |
| `LokiPushFailing` | warning | [ALERTING#loki-and-the-trace-pipeline](ALERTING.md#loki-and-the-trace-pipeline) |
| `LokiRetentionStale` | warning | [ALERTING#loki-and-the-trace-pipeline](ALERTING.md#loki-and-the-trace-pipeline) |
| `OtelSpanExportFailing` | warning | [ALERTING#otelspanexportfailing](ALERTING.md#otelspanexportfailing) |
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
  heading, and refuses inline receiver credentials. It also fails on a dashboard
  query (named by file and panel) that reads a metric nobody emits, on
  `observability/dashboards` and `deploy/k8s/infra/dashboards` that differ, on a
  Grafana datasource whose host is no compose service / K8s Service, and on a
  `probe_*` rule without a blackbox job (`metrics_path: /probe`) in compose or K8s.

## Compose observability stack (parity with K8s)

Compose runs the same datasources as K8s, each one fed:

- **Logs**: `promtail` reads the compose containers through the Docker API of `docker-socket-proxy` (the only holder of `/var/run/docker.sock`, read-only mount; the proxy refuses every `POST`, ADR-0011 amendment) and pushes to Loki with the K8s `json` pipeline (labels `component`, `job`, `container`, `level`). Check: Grafana → Explore → Loki → `{component="api-gateway"}`.
- **Traces**: services export OTLP/HTTP straight to `jaeger:4318` (`OTEL_EXPORTER_OTLP_ENDPOINT`); there is no OTel collector in compose. UI on `JAEGER_PORT` (default 16686).
- **SVID expiry**: `blackbox-exporter` probes `/ping` of the 7 services with its own SVID (`spiffe-helper-blackbox`, SPIRE entry `blackbox-exporter` made by `spire-bootstrap`). `/ping` answers before the ACL, so any valid SVID passes. `CertificateExpiry` carries the `service` label in both environments (one target per service in `observability/prometheus.yml` and `deploy/k8s/infra/prometheus.yaml`).

## Reloading the Prometheus configuration

Prometheus runs without `--web.enable-lifecycle` (issue #850): `POST /-/reload` and `/-/quit` answer 403/404 for any network client.

- K8s: the Prometheus container checksums `/etc/prometheus` every 20 s and sends itself `SIGHUP` (PID 1) when it changed. After `kubectl apply`, the new rules are live within about a minute (kubelet ConfigMap sync included).
- Compose: `docker kill --signal=HUP trading-prometheus` after editing `observability/*.yml`.
