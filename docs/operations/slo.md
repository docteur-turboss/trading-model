# Service Level Objectives (SLO)

## Overview

This document defines the Service Level Indicators (SLIs), Objectives (SLOs),
and Error Budgets for the trading-model microservices platform.

## SLIs

### 1. API Availability

- **Definition:** Proportion of valid HTTP requests that return a successful
  response (status 2xx or 3xx) within the timeout window.
- **Measurement:** Prometheus `http_requests_total` with
  `status !~ "5.."` over `status =~ ".*"`.
- **Source:** All HTTP-serving services.

### 2. API Latency (P95)

- **Definition:** 95th percentile of HTTP request duration.
- **Measurement:** Prometheus `histogram_quantile(0.95,
rate(http_request_duration_seconds_bucket[5m]))`.
- **Source:** All HTTP-serving services.

### 3. Error Rate

- **Definition:** Proportion of HTTP responses with status 5xx.
- **Measurement:** Prometheus `rate(http_requests_total{status=~"5.."}[5m])
/ rate(http_requests_total[5m])`.
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
- **Measurement:** Prometheus `rate(tt_training_sessions_total{result="completed"}[15m]) /
rate(tt_training_sessions_total[15m])`.
- **Source:** trader-trainer.

## SLOs

| SLI                     | Target   | Window | Burn Rate Alert (fast)       | Burn Rate Alert (slow)         |
| ----------------------- | -------- | ------ | ---------------------------- | ------------------------------ |
| Availability            | ≥ 99.9%  | 30d    | > 2% error rate over 5m      | > 0.5% error rate over 1h      |
| Latency P95             | ≤ 2s     | 30d    | P95 > 5s over 5m             | P95 > 3s over 1h               |
| Error Rate              | < 1%     | 30d    | > 5% over 5m                 | > 2% over 1h                   |
| Message Delivery        | ≥ 99.95% | 30d    | < 99.5% over 5m              | < 99.8% over 1h                |
| DLQ Drain Ratio         | ≥ 1.0    | 30d    | ratio < 0.8 over 15m         | ratio < 0.95 over 1h           |
| Training Completion     | ≥ 99%    | 30d    | < 95% over 15m               | < 98% over 1h                  |

### Availability SLO (99.9%)

- Monthly allowance: ~43m of downtime.
- Burn rate 1x at 0.1% error rate.
- Fast burn: 20x (2% error rate) → alert within ~2m.
- Slow burn: 5x (0.5% error rate) → alert within ~12m.

### Latency SLO (P95 ≤ 2s)

- Measured as a rolling 5m window.
- Fast burn: P95 > 5s for 5m.
- Slow burn: P95 > 3s for 1h.

### Error Rate SLO (< 1%)

- Fast burn: error rate > 5% for 5m.
- Slow burn: error rate > 2% for 1h.

## Error Budget Policy

1. **Budget remaining > 50%:** Proceed with normal deployments.
2. **Budget 20–50%:** Freeze non-critical features; prioritise reliability work.
3. **Budget < 20%:** Full freeze on all changes except critical bug fixes and
   rollbacks. Mandatory postmortem.

## Burn Rate Alerts

The following burn rate alerts are configured in `observability/alerting.yml`:

- `SLOAvailabilityFastBurn`: 99.9% SLO, 5m window, multi-window multi-burn-rate.
- `SLOAvailabilitySlowBurn`: 99.9% SLO, 1h window.
- `SLOLatencyFastBurn`: P95 ≤ 2s SLO, 5m window.
- `SLOLatencySlowBurn`: P95 ≤ 2s SLO, 1h window.
- `SLOErrorRateFastBurn`: < 1% error rate SLO, 5m window.
- `SLOErrorRateSlowBurn`: < 1% error rate SLO, 1h window.

## Dashboard Alignment

All SLOs are visualised on the Grafana "SLO" dashboard (see
`observability/dashboards/`).
