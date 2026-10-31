# Runbook: Market Data Stale

**Severity:** SEV2 (the platform runs, but trades and training work on old data)
**Alerts:** `MarketDataStale`, `TrainerMarketDataStale`, `ScrapeCyclesFailing`, `BinanceRestrictedLocation`
**Affected:** financial-scraper (collector), message-manager, trader-trainer

The services can all be up and ready while no data flows: readiness checks
dependencies (MySQL, Redis), not that candles arrive.

## Which alert tells what

| Firing | Broken part |
| --- | --- |
| `MarketDataStale` (+ `TrainerMarketDataStale`) | collection: nothing is persisted, so nothing is published |
| `ScrapeCyclesFailing` | cycles run but fail (Binance, MySQL) |
| `BinanceRestrictedLocation` | Binance geo-blocks the collector (451): apply the ADR-0026 fallback |
| `TrainerMarketDataStale` alone | delivery: the scraper persists, the trainer receives nothing (message-manager, subscription) |

## Triage (Kubernetes)

```bash
NS=trading-model
# 1. One collector runs the scrape cron; the financial-scraper replicas serve HTTP only.
kubectl -n $NS get deploy financial-scraper-collector
kubectl -n $NS logs deploy/financial-scraper-collector --tail=100 | grep -iE "symbol|schedule|error"

# 2. Symbols and schedule actually used
kubectl -n $NS get configmap financial-scraper-config -o jsonpath='{.data.SYMBOLS_TO_TRACK}{"\n"}{.data.SCRAPE_INTERVAL}{"\n"}'
kubectl -n $NS get deploy financial-scraper-collector -o jsonpath='{.spec.template.spec.containers[0].env}' | grep -o 'SCRAPE_SCHEDULER_ENABLED[^}]*'

# 3. Counters behind the alerts
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum(increase(fs_candles_persisted_total[15m]))'
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum by (result) (increase(fs_scrape_cycles_total[15m]))'
```

## Common causes

1. **No symbol tracked**: `SYMBOLS_TO_TRACK` empty or invalid. The service now
   refuses to start on an invalid value and logs a warning when the list is
   empty (since 2026-10-26). Set it to the `TRAINER_SYMBOLS` list.
2. **Scheduler disabled everywhere**: `SCRAPE_SCHEDULER_ENABLED=false` on the
   collector too, or the collector scaled to 0.
3. **Binance unreachable**: `fs_binance_requests_total{status!="200"}` growing.
   - **451** (`BinanceRestrictedLocation`): Binance refuses the region.
     Confirm from the collector pod, then apply the first fallback of
     [ADR-0026](../../adr/0026-binance-public-market-data-kept.md), the
     market-data-only host (same API, configuration change only):
     ```bash
     kubectl -n $NS exec deploy/financial-scraper-collector -- \
       node -e "fetch('https://api.binance.com/api/v3/ping').then(r=>console.log(r.status))"
     kubectl -n $NS exec deploy/financial-scraper-collector -- \
       node -e "fetch('https://data-api.binance.vision/api/v3/ping').then(r=>console.log(r.status))"
     kubectl -n $NS patch configmap financial-scraper-config --type merge \
       -p '{"data":{"BINANCE_BASE_URL":"https://data-api.binance.vision"}}'
     kubectl -n $NS rollout restart deploy/financial-scraper-collector deploy/financial-scraper
     ```
     Report it in Git too (`deploy/k8s/config/financial-scraper-configmap.yaml`)
     or the next deploy reverts it. If both hosts answer 451, the second
     fallback (another exchange) is a development task: re-open ADR-0026.
   - **403** (WAF violation) or **418** (IP ban after ignored 429s): not
     retried. Lower the request weight (fewer `SYMBOLS_TO_TRACK`, longer
     `SCRAPE_INTERVAL`) and wait for the ban to expire.
   - **429** (rate limit): retried with backoff; persistent 429s lead to 418.
   - Network errors: the scraper NetworkPolicy allows egress to any public
     address on 443; check DNS and the node's outbound access.
4. **MySQL writes failing**: cycles fail (`ScrapeCyclesFailing`), MySQL errors
   in the logs; see [runbook-database-failover](runbook-database-failover.md).
5. **Trainer only** (`TrainerMarketDataStale` alone): message-manager or the
   trainer subscription; see [runbook-message-bus-outage](runbook-message-bus-outage.md).

## Resolution check

`sum(increase(fs_candles_persisted_total[15m]))` and
`sum(increase(tt_market_data_received_total[15m]))` grow again; the alerts
resolve within 15 minutes.
