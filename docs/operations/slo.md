# Service Level Objectives (SLO)

## Overview

This document defines the Service Level Indicators (SLIs), Objectives (SLOs),
and Error Budgets for the trading-model microservices platform.

## SLIs

### 1. API Availability

- **Definition:** Proportion of valid HTTP requests that return a successful
  response (status 2xx or 3xx) within the timeout window.
- **Measurement:** Prometheus `http_requests_total` with
  `status !~ "5.."` over all requests, excluding the technical routes
  `path=~"/ping|/health/ready|/metrics"` (probes and scrapes, not user traffic).
  The exclusion is in the alert rules, not the middleware, so dashboards keep
  the raw counters.
- **Source:** All HTTP-serving services.

### 2. API Latency (P95)

- **Definition:** 95th percentile of HTTP request duration.
- **Measurement:** Prometheus `histogram_quantile(0.95,
rate(http_request_duration_seconds_bucket[5m]))`.
- **Source:** All HTTP-serving services.

### 3. Error Rate

- **Definition:** Proportion of HTTP responses with status 5xx.
- **Measurement:** Prometheus `rate(http_requests_total{status=~"5.."}[5m])
/ rate(http_requests_total[5m])`, same technical-route exclusion.
- **Source:** All HTTP-serving services.

### 4. Message Delivery Success Rate

- **Definition:** Proportion of messages successfully delivered by message-manager.
- **Measurement:** Prometheus `rate(mm_messages_published_total[5m]) /
(rate(mm_messages_published_total[5m]) + rate(mm_messages_dlq_total[5m]))`.
- **Source:** message-manager.

### 5. DLQ Drain Rate

- **Definition:** Rate at which DLQ entries are replayed relative to entries added.
- **Measurement:** Prometheus `rate(dlq_entries_replayed_total[5m]) /
rate(dlq_entries_added_total[5m])`. A ratio below 1.0 means the queue is growing.
- **Source:** dlq-service.

### 6. Training Completion Rate

- **Definition:** Proportion of training sessions that complete successfully.
- **Measurement:** Prometheus `rate(tt_training_sessions_total{result="success"}[15m]) /
rate(tt_training_sessions_total[15m])`.
- **Source:** trader-trainer.

### 7. Data Freshness

- **Definition:** Proportion of candles persisted by financial-scraper that
  reach trader-trainer.
- **Measurement:** Prometheus `increase(tt_market_data_received_total[30m]) /
increase(fs_candles_persisted_total[30m])`, both summed over all replicas.
- **Source:** financial-scraper, trader-trainer.

## SLOs

| SLI                 | Target   | Window | Alerts |
| ------------------- | -------- | ------ | ------ |
| Availability        | ≥ 99.9%  | 30d    | fast: 5xx > 1.44% over 1h and 5m (14.4x); slow: > 0.6% over 6h and 30m (6x) |
| Error Rate          | < 1%     | 30d    | fast: 5xx > 14.4% over 1h and 5m (14.4x); slow: > 6% over 6h and 30m (6x) |
| Latency P95         | ≤ 2s     | 30d    | fast: P95 > 5s over 5m; slow: P95 > 3s over 1h (single window) |
| Message Delivery    | ≥ 99.95% | 30d    | `MessageDeliveryLowSuccessRate`: < 99.5% over 5m (no slow burn) |
| DLQ Drain Ratio     | ≥ 1.0    | 30d    | `DLQSizeGrowing`, `DLQDrainRateLow` (no slow burn) |
| Training Completion | ≥ 99%    | 30d    | `TrainingCompletionRateLow`: < 95% over 15m (no slow burn) |
| Data Freshness      | ≥ 90%    | 30d    | `CandleDeliveryLagging`: < 50% over 30m, for 15m; `MarketDataStale` / `TrainerMarketDataStale` when nothing flows |

The Message Delivery, DLQ and Training SLOs have no slow-burn alert: their
traffic is low and bursty, so a 1h ratio flaps on a handful of events. A
dead-lettered message already raises `MessagesDeadLettered`, and the existing
alert on each SLI catches sustained loss. Adding them needs a minimum-volume
guard first. `CandleDeliveryLagging` is set at 50%, not at the 90% target, until
the real ratio is measured in production.

### Availability SLO (99.9%) and Error Rate SLO (< 1%)

Multi-window multi-burn-rate: an alert fires only when the long window (the
budget is really burning) and the short window (it is still burning) both
exceed the threshold. Thresholds are the burn rate times the budget (0.1% and 1%).

- Fast burn, 14.4x: windows 1h and 5m, `for: 2m`, critical (2% of a 30d budget in 1h).
- Slow burn, 6x: windows 6h and 30m, `for: 15m`, warning (5% of a 30d budget in 6h).

### Latency SLO (P95 ≤ 2s)

A quantile has no error budget to burn, so the alerts stay single-window:

- Fast burn: P95 > 5s for 5m.
- Slow burn: P95 > 3s for 1h.

## Error Budget Policy

1. **Budget remaining > 50%:** Proceed with normal deployments.
2. **Budget 20–50%:** Freeze non-critical features; prioritise reliability work.
3. **Budget < 20%:** Full freeze on all changes except critical bug fixes and
   rollbacks. Mandatory postmortem.

## Burn Rate Alerts

The following alerts are configured in `observability/alerting.yml` (copied
into `deploy/k8s/infra/prometheus.yaml`):

- `SLOAvailabilityFastBurn`, `SLOAvailabilitySlowBurn`: 99.9% SLO, multi-window multi-burn-rate (1h/5m at 14.4x, 6h/30m at 6x).
- `SLOErrorRateFastBurn`, `SLOErrorRateSlowBurn`: < 1% error rate SLO, same windows.
- `SLOLatencyFastBurn`, `SLOLatencySlowBurn`: P95 ≤ 2s SLO, 5m and 1h windows.
- `MessageDeliveryLowSuccessRate`, `DLQDrainRateLow`, `TrainingCompletionRateLow`: one alert per SLI.
- `CandleDeliveryLagging`: data freshness SLO.

The rules compute the ratios inline (no recording rules).

## Dashboard Alignment

All SLOs are visualised on the Grafana "SLO" dashboard (see
`observability/dashboards/`).
