# Service Level Objectives (SLO)

## Overview

This document defines the Service Level Indicators (SLIs), Objectives (SLOs),
and Error Budgets for the trading-model microservices platform.

## SLIs

### 1. API Availability

- **Definition:** Proportion of valid HTTP requests that return a successful
  response (status 2xx or 3xx) within the timeout window.
- **Measurement:** Prometheus `http_requests_duration_seconds_count` with
  `status !~ "5.."` over `status =~ ".*"`.
- **Source:** All HTTP-serving services.

### 2. API Latency (P95)

- **Definition:** 95th percentile of HTTP request duration.
- **Measurement:** Prometheus `histogram_quantile(0.95,
  rate(http_requests_duration_seconds_bucket[5m]))`.
- **Source:** All HTTP-serving services.

### 3. Error Rate

- **Definition:** Proportion of HTTP responses with status 5xx.
- **Measurement:** Prometheus `rate(http_requests_duration_seconds_count{status=~"5.."}[5m])
  / rate(http_requests_duration_seconds_count[5m])`.
- **Source:** All HTTP-serving services.

## SLOs

| SLI | Target | Window | Burn Rate Alert (fast) | Burn Rate Alert (slow) |
|-----|--------|--------|----------------------|-----------------------|
| Availability | ≥ 99.9% | 30d | > 2% error rate over 5m | > 0.5% error rate over 1h |
| Latency P95 | ≤ 2s | 30d | P95 > 5s over 5m | P95 > 3s over 1h |
| Error Rate | < 1% | 30d | > 5% over 5m | > 2% over 1h |

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
