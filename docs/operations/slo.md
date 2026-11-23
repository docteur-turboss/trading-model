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
rate(http_request_duration_seconds_bucket{path!~"/ping|/health/ready|/metrics"}[5m]))`
  (same technical-route exclusion as the error SLI).
  The histogram has a `status_class` label (`2xx`..`5xx`); the SLO and alert
  rules aggregate it away (`sum by (job, le)`), so the P95 counts every
  response, errors included. For successes only, add
  `{status_class="2xx"}` to the selector.
- **Source:** All HTTP-serving services.

### 3. Error Rate (SLI of the availability SLO)

- **Definition:** Proportion of HTTP responses with status 5xx.
- **Measurement:** Prometheus `rate(http_requests_total{status=~"5.."}[5m])
/ rate(http_requests_total[5m])`, same technical-route exclusion.
- **Source:** All HTTP-serving services.

### 4. Message Delivery Success Rate
- **Definition:** Proportion of delivery outcomes that succeed: a message accepted but not delivered (subscriber down, retries pending) no longer counts as success once it is dead-lettered.
- **Measurement:** Prometheus `rate(mm_messages_delivered_total{status="success"}[5m]) /
(rate(mm_messages_delivered_total{status="success"}[5m]) + rate(mm_messages_dlq_total[5m]))`.
- **Source:** message-manager.

### 5. Training Completion Rate

- **Definition:** Proportion of training sessions that complete successfully.
- **Measurement:** Prometheus `rate(tt_training_sessions_total{result="success"}[12h]) /
rate(tt_training_sessions_total[12h])`.
- **Source:** trader-trainer.

### 6. Data Freshness

- **Definition:** Age of the newest candle the trainer reads from financial-scraper.
- **Measurement:** Prometheus `min(tt_last_candle_age_seconds)`, read at each session.
- **Source:** trader-trainer.

## SLOs

| SLI                 | Target   | Window | Alerts |
| ------------------- | -------- | ------ | ------ |
| Availability        | ≥ 99.9%  | 30d    | fast: 5xx > 1.44% over 1h and 5m (14.4x); slow: > 0.6% over 6h and 30m (6x) |
| Latency P95         | ≤ 2s     | 30d    | fast: P95 > 5s over 5m; slow: P95 > 3s over 1h (single window) |
| Message Delivery    | ≥ 99.95% | 30d    | `MessageDeliveryLowSuccessRate`: < 99.5% over 5m (no slow burn) |
| Training Completion | ≥ 99%    | 30d    | `TrainingCompletionRateLow` (warning): < 95% over 12h; `TrainingCompletionRateCritical` (critical, pages): < 50% over 12h (no slow burn) |
| Data Freshness      | ≤ 15 min | 30d    | `MarketDataStale` / `TrainerMarketDataStale` |

The Message Delivery and Training SLOs have no slow-burn alert: their
traffic is low and bursty, so a 1h ratio flaps on a handful of events. A
dead-lettered message already raises `BusDeadLetters`, and the existing
alert on each SLI catches sustained loss. Adding them needs a minimum-volume
guard first.

### Availability SLO (99.9%)

Multi-window multi-burn-rate: an alert fires only when the long window (the
budget is really burning) and the short window (it is still burning) both
exceed the threshold. Thresholds are the burn rate times the budget (0.1%).

- Fast burn, 14.4x: windows 1h and 5m, `for: 2m`, critical (2% of a 30d budget in 1h).
- Slow burn, 6x: windows 6h and 30m, `for: 15m`, warning (5% of a 30d budget in 6h).

### Latency SLO (P95 ≤ 2s)

A quantile has no error budget to burn, so the alerts stay single-window:

- Fast burn: P95 > 5s for 5m.
- Slow burn: P95 > 3s for 1h.

## Outside working hours

Service outside working hours is an owner decision (issue #1613, option B): no backup person and no paging
escalation. Losses during the hours nobody watches are accepted, as listed
below.

- **Covered hours:** Monday to Friday, 09:00-19:00 Europe/Paris, public
  holidays excluded. Inside them, the targets of
  [on-call.md](on-call.md#responsibilities) apply (15 min L1, 1 hour L2).
- **Outside them:** best effort. Pushover still repeats a `critical` alert
  until it is acknowledged, but nobody is expected to answer. Target: reaction
  at the start of the next covered period (Monday 09:00 for a Friday-night
  incident), so an incident can last up to about 62 hours (Friday 19:00 to
  Monday 09:00).
- **Error budget:** time lost outside covered hours counts against the SLOs
  above like any other time. A night incident that burns more than the budget
  policy allows triggers the same freeze and postmortem.

### Losses accepted while nobody reacts

A collection that does not run is not caught up later, except where the
source itself returns a window wider than the outage. Lost data is lost for
good (point-in-time sources, ADR-0036).

| Data | Lost when the outage lasts longer than | Why |
| ---- | -------------------------------------- | --- |
| `nws-kansas-wheat-belt` | 1 hour (each missed hourly run) | latest observation only |
| `twelvedata-daily-prices` | 1 missed run (01:30 UTC, Tuesday to Saturday) | `outputsize=1`: the previous close only |
| Binance trades, order books, tickers | any outage | snapshots of the moment, no history fetched |
| `ecb-*` | 5 observations (about a week for daily series) | `lastNObservations=5` |
| `nasa-power-crop-regions`, `wikipedia-pageviews`, `federal-register-documents` | 7 days | window `{date-8}` to `{date-1}` |
| `cftc-cot-legacy`, `eia-weekly-energy` | 5 weeks | last 5 reports |
| `treasury-par-yield-curve`, `sec-edgar-*`, `fred-us-macro`, `eurostat-*`, `dvf-commune-sales` | not lost within a weekend | the source returns the whole year, series or file |
| Binance candles | not lost | each series restarts from its newest stored candle (`market_candles`) |

The table follows `services/financial-scraper/src/config/signal-registry.json`:
a new source gets a row here. No command backfills a gap.

A value collected late (after a weekend, for instance) gets a later
`observedAt` than if it had been collected on time: features stay
point-in-time correct, but they see the value later.

## Error Budget Policy

1. **Budget remaining > 50%:** Proceed with normal deployments.
2. **Budget 20–50%:** Freeze non-critical features; prioritise reliability work.
3. **Budget < 20%:** Full freeze on all changes except critical bug fixes and
   rollbacks. Mandatory postmortem.

## Burn Rate Alerts

The following alerts are configured in `deploy/k8s/infra/config/alerting.yml`:

- `SLOAvailabilityFastBurn`, `SLOAvailabilitySlowBurn`: 99.9% SLO, multi-window multi-burn-rate (1h/5m at 14.4x, 6h/30m at 6x).
- `SLOErrorBudgetLow`: less than 20% of the 30d budget left (recording rule `slo:sli_error:ratio_rate30d`).
- `SLOLatencyFastBurn`, `SLOLatencySlowBurn`: P95 ≤ 2s SLO, 5m and 1h windows.
- `MessageDeliveryLowSuccessRate`, `TrainingCompletionRateLow`: one alert per SLI.

The burn-rate rules and the budget read the recording rules `slo:sli_error:ratio_rate{5m,30m,1h,6h,30d}`, which exclude `/ping`, `/health/ready` and `/metrics` and fall back to the blackbox probe failure rate of the same `job` when a service receives no requests (full outage); `ratio_rate30d` is the 30-day mean of `ratio_rate1h`, not weighted by traffic.

## Dashboard Alignment

All SLOs are visualised on the Grafana "SLO" dashboard (see
`deploy/k8s/infra/dashboards/`).
