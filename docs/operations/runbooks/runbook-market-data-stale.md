# Runbook: Market Data Stale

**Severity:** L2 (the platform runs, but trades and training work on old data)
**Alerts:** `CollectorNoLeader`, `MarketDataStale`, `TrainerMarketDataStale`, `ScrapeCyclesFailing`, `SymbolMarketDataStale`, `BinanceRestrictedLocation`, `SignalCollectionFailing`, `SignalSourceStale`
**Affected:** financial-scraper (collector), message-manager, trader-trainer

The services can all be up and ready while no data flows: readiness checks
dependencies (MySQL, Redis), not that candles arrive.

## Which alert tells what

| Firing | Broken part |
| --- | --- |
| `CollectorNoLeader` | no collector pod holds the Lease, so none collects: see [CollectorNoLeader](#collectornoleader) |
| `MarketDataStale` (+ `TrainerMarketDataStale`) | collection: nothing is persisted, so nothing is published |
| `ScrapeCyclesFailing` | cycles run but fail (Binance, MySQL) |
| `SymbolMarketDataStale` | one symbol gets no candle, the others do: see [SymbolMarketDataStale](#symbolmarketdatastale) |
| `BinanceRestrictedLocation` | Binance geo-blocks the collector (451): apply the ADR-0026 fallback |
| `TrainerMarketDataStale` alone | read: the scraper persists, the trainer reads no fresh candle (scraper candle route, ACL, MySQL) |

## Triage (Kubernetes)

```bash
NS=trading-model
# 1. The collector pod holding the Lease runs the crons (ADR-0057); the financial-scraper replicas serve HTTP only.
kubectl -n $NS get deploy financial-scraper-collector
kubectl -n $NS get lease financial-scraper-collector -o jsonpath='{.spec.holderIdentity}{"
"}'
kubectl -n $NS logs deploy/financial-scraper-collector --tail=100 | grep -iE "symbol|schedule|error"

# 2. Symbols and schedule actually used
kubectl -n $NS exec deploy/financial-scraper-collector -c financial-scraper-collector -- printenv SYMBOLS_TO_TRACK SCRAPE_INTERVAL
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
   collector too, or the collector scaled to 0, or no collector holds the
   Lease (`CollectorNoLeader`).
3. **Binance unreachable**: `fs_binance_requests_total{status!="200"}` growing.
   - **451** (`BinanceRestrictedLocation`): Binance refuses the region.
     Confirm from the collector pod:
     ```bash
     kubectl -n $NS exec deploy/financial-scraper-collector -- \
       node -e "fetch('https://api.binance.com/api/v3/ping').then(r=>console.log(r.status))"
     ```
     Do **not** switch to `data-api.binance.vision`: its terms forbid live
     trading ([ADR-0077](../../adr/0077-rank-the-market-data-source-terms.md)),
     and the scraper refuses to start with it when `NODE_ENV=production`
     (every K8s overlay, staging included). The next fallback is another
     exchange (Bitstamp, ADR-0077), a development task: re-open
     [ADR-0026](../../adr/0026-binance-public-market-data-kept.md). Until
     then, stop the collection (`SCRAPE_SCHEDULER_ENABLED=false` or scale the
     collector to 0) rather than run on an inadmissible source.
   - **403** (WAF violation) or **418** (IP ban after ignored 429s): not
     retried. Lower the request weight (fewer `SYMBOLS_TO_TRACK`, longer
     `SCRAPE_INTERVAL`) and wait for the ban to expire.
   - **429** (rate limit): not retried; the source is quarantined until
     `Retry-After` (doubling backoff if absent), as for 418.
   - Network errors: the scraper NetworkPolicy allows egress to any public
     address on 443; check DNS and the node's outbound access.
4. **MySQL writes failing**: cycles fail (`ScrapeCyclesFailing`), MySQL errors
   in the logs; see [runbook-database-failover](runbook-database-failover.md).
5. **Trainer only** (`TrainerMarketDataStale` alone): the trainer logs "Stored candles unreadable"
   or reads an old window; check the scraper candle read route
   route and the trainer ACL.

## Resolution check

`sum(increase(fs_candles_persisted_total[15m]))` and
`min(tt_last_candle_age_seconds)` falls under 900 at the next training session
(`TRAINER_INTERVAL_MS`); the alerts resolve then.

## CollectorNoLeader

No pod reported `fs_collector_leader` = 1 for 2 minutes: no collector holds
the Lease `financial-scraper-collector`, so nothing is collected (ADR-0057).
A rollout handover lasts seconds and never fires it.

```bash
NS=trading-model
# Holder, last renewal, transitions. A holder that is no running pod: the
# Lease expires 15 s after its last renewal and a running collector takes it.
kubectl -n $NS get lease financial-scraper-collector -o yaml
kubectl -n $NS get pods -l app.kubernetes.io/component=financial-scraper-collector
# Election logs: "Collector lease acquired", "Collector lease unreachable",
# "Collector stops collecting" (with the reason)
kubectl -n $NS logs deploy/financial-scraper-collector -c financial-scraper-collector --tail=200 | grep -i lease
```

| Seen | Cause and fix |
| --- | --- |
| No collector pod, or not ready | Deployment scaled to 0 or crash loop: `kubectl -n $NS describe deploy financial-scraper-collector`, then its pod logs |
| `Collector lease unreachable` with 403 | RBAC: the Role `financial-scraper-collector-lease` or its RoleBinding is missing, or the Lease name differs from `COLLECTOR_LEASE_NAME`. Apply the overlay again |
| `Collector lease unreachable` with 404 | The Lease object is missing (the Role grants no `create`). Apply the overlay again |
| `Collector lease unreachable` with a timeout or ECONNREFUSED | API server unreachable from the pod: NetworkPolicy `financial-scraper-collector-apiserver` (private ranges, 443/6443), or the API server is down |
| Startup error on `/var/run/secrets/kubernetes.io/serviceaccount` | The token is not mounted: `automountServiceAccountToken: true` is missing from the collector pod template |
| No lease log at all | Collection disabled on the collector (`SYMBOLS_TO_TRACK` empty and signals off): see Common causes 1 and 2 |

A holder that stopped renewing (frozen pod) keeps the Lease for 15 s at most.
To hand it over at once, delete that pod; never edit the Lease by hand while
a collector runs.

**Resolution check:** `max(fs_collector_leader)` is 1 again and
`kubectl -n $NS get lease financial-scraper-collector` names a running pod.

## SymbolMarketDataStale

**Severity:** L2 (critical). No candle of one tracked symbol was persisted
for 15 minutes while the others may still flow: the cycle counts as `success`
and `MarketDataStale` (global sum) stays silent, but that symbol gets no new
data and the trainer stops training it (`TRAINER_MAX_DATA_AGE_MS`). The
`symbol` label of the alert names it (issue #598: BTCUSDT failed 689 times in
33 hours unseen). It reads `fs_candles_persisted_total{symbol}`, so it fires
whatever the cause: the whole symbol fails (`fs_symbols_failed_total{symbol}`),
or only its candles part does while the symbol still counts as scraped
(`fs_snapshot_parts_failed_total{part="candles"}`, no `symbol` label: read the
logs).

```bash
NS=trading-model
# Candles persisted, failed and successful scrapes by symbol over 15 minutes
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO-   'http://localhost:9090/api/v1/query?query=sum by (symbol) (increase(fs_candles_persisted_total[15m]))'
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO-   'http://localhost:9090/api/v1/query?query=sum by (symbol) (increase(fs_symbols_failed_total[15m]))'
# The error, for the whole symbol or for its candles part only
kubectl -n $NS logs deploy/financial-scraper-collector --since=30m   | grep -E "Symbol scrape failed|Market data part (fetch|normalization) failed" | grep <SYMBOL>
```

Read the `error` of the log line:

- **Binance error for that symbol only** (400 `Invalid symbol`: delisted or
  misspelled): fix `SYMBOLS_TO_TRACK`. Whole symbol: `Symbol scrape failed`.
- **klines endpoint failing for that symbol** (`Market data part fetch
  failed`, `part: candles`): the other parts are still kept; see the Binance
  checks above.
- **Validation error** (`Market data part normalization failed`, `part:
  candles`, e.g. `RangeError: ... must be ...`): Binance sent candles the
  normalizer refuses. Only the candles are dropped, the symbol still counts as
  scraped. A code fix; the candles are fetched again from the same cursor
  until then (it only moves past persisted candles).
- **MySQL error**: see [runbook-database-failover](runbook-database-failover.md).

The alert resolves within 15 minutes once a candle of the symbol is persisted
again.

## SignalSourceStale

**Severity:** L4 (warning). A registry source (ADR-0036) has had no
successful collection for longer than its threshold (`maxAgeSeconds` in
`signal-registry.json`, else three periods of its `schedule`), with no failure
counted. A source that answers 200 with an empty list still counts as a
success: compare `fs_signal_newest_observed_timestamp_seconds` by hand for it.

- **Lease lost**: `fs_collector_leader` is 0 on every pod (alert
  `CollectorNoLeader`); see its section.
- **Cron stopped**: a leader exists but the source logs neither
  "Signal collection failed" nor "Previous signal collection still running:
  tick skipped": its `schedule` is wrong or its API key is unset
  (`fs_signal_source_disabled`). Fix the registry or secret, restart.
- **Source stopped** (a tick that hangs, publisher down without error):
  raise `maxAgeSeconds` or remove the source if the stop is final.

## SignalCollectionFailing

**Severity:** L4 (warning). Binance market data is not affected: only the
signals of one registry source (ADR-0036) are missing or stale. The alert
stays on for 24 hours after the last failure.

```bash
NS=trading-model
# Failures by source and result over the last day
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO-   'http://localhost:9090/api/v1/query?query=sum by (source, result) (increase(fs_signal_collections_total[1d]))'
# The error of each failed request
kubectl -n $NS logs deploy/financial-scraper-collector --since=24h | grep "Signal collection failed"
```

By `result`:

- **`fetch_error`**: the source is down, refuses the request or cannot be
  reached. SEC EDGAR answers 403 without contact e-mail: check that the
  GitHub environment secret `SIGNAL_CONTACT_EMAIL` is set and that the
  `signal-contact` ConfigMap holds it, then restart the collector (it reads
  the e-mail at start). A 429 means the source rate-limits us: lower
  `maxRequestsPerMinute` or move the schedule in `signal-registry.json`.
- **`invalid_payload`**: the source changed its format. Compare the logged
  error with the adapter of `src/adapters/outbound/signal-sources/` and its
  fixture; nothing is stored until the adapter is fixed.
- **`store_error`**: MySQL refuses the writes; see
  [runbook-database-failover](runbook-database-failover.md).

**Quarantine.** After 3 consecutive ticks with a `fetch_error`, at once on
a 401 or 403 or an answer with `Retry-After`, the collector skips the ticks
of the source (counted `result="skipped_quarantine"`, so this alert stays on)
until a deadline: 1 h doubling to 24 h, never before `Retry-After`. One trial
request follows; a success closes it. Read it: gauge
`fs_signal_source_quarantined{source}` = 1 and the "Signal source
quarantined" log (`until`). Force a new trial: restart the collector
(`kubectl -n $NS rollout restart deploy/financial-scraper-collector`); the
state is in memory only. Fix the cause first (key, e-mail, rate), or the
trial fails and the quarantine starts again.

A collection that failed is not retried before the next schedule of its
source; values the source still publishes then are collected again (ECB: last
5, Wikimedia: 8 days, NWS: latest observation only).
