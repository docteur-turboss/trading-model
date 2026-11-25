# Runbook: Risk/Execution Kill Switch, Reconciliation, Stale Prices

**Severity:** L1 (`KillSwitchEngaged`, `ReconciliationMismatch`), L2 (`RiskRejectRatioHigh`, `RiskMarketDataStale`, `RiskTickFailing`)
**Alerts:** `KillSwitchEngaged`, `ReconciliationMismatch`, `RiskRejectRatioHigh`, `RiskMarketDataStale`, `RiskTickFailing`, `RiskOutboxDropped`, `RiskOutboxPending`, `DecisionIntentsRejected`
**Decision:** [ADR-0064](../../adr/0064-risk-and-execution-context-before-order-flow.md) · **Policy:** [risk-limits-policy](../../compliance/risk-limits-policy.md) · **Drill log:** [risk-drill-log](../../compliance/risk-drill-log.md)

`risk-execution` owns every order (paper only: simulated broker, no live adapter). The switch state is in `/data/risk-execution/state.json` on its PVC. Nothing re-arms the switch except an operator, by hand.

## Operate the service

`GET /admin/status` accepts only the service's own identity: `scripts/risk-admin.sh status` runs it from the pod. Engaging and re-arming go through the gateway with an API key of scope `risk:admin` (`RISK_ADMIN_URL` = edge-proxy base URL, `RISK_ADMIN_KEY`): the key name is the actor recorded in the audit trail, and the owner is the key named `RISK_OWNER_ACTOR` (default `owner`). With the gateway down, no one can engage or re-arm.

```bash
bash scripts/risk-admin.sh status
# Engage (global, or add --symbol BTCUSDT):
bash scripts/risk-admin.sh engage --reason "<why>"
# Re-arm, after checking that the cause is gone:
bash scripts/risk-admin.sh rearm --reason "<what you checked>"
```

Service unreachable, last resort: revoke the broker API key at the exchange, or delete the SPIRE entry of `risk-execution` (ADR-0064 §5). Closing positions is never automatic: decide it explicitly.

## KillSwitchEngaged

1. `GET /admin/status`: `killSwitch.global` / `killSwitch.symbols` name the reason: `daily_loss`, `daily_loss_symbol`, `drawdown`, `stale_data`, `reconciliation`, `rejects`, `state_missing`, `state_unreadable`, `operator`.
2. Check the cause is gone, then re-arm (policy §4.4):
   - `daily_loss`, `daily_loss_symbol`: the limit restarts at 00:00 UTC but the switch does not; re-arm after review.
   - `drawdown`: only the owner (`RISK_OWNER_ACTOR`) re-arms, after reviewing the strategy.
   - `stale_data`, `reconciliation`, `rejects`: see the sections below.
   - `state_missing`: no `state.json` at start (first install, or the volume was lost). After a loss, restore it first (`restore-k8s.sh --components risk`, [BACKUP_DR](../../deployment/BACKUP_DR.md)); on a first install, or when no backup is usable, re-arm once you have checked there is nothing to restore. The `deploy.yml` gate (`deploy-k8s.sh verify-release`) reports this alert without rolling back, so the first deploy of a new or rebuilt environment passes; re-arm after it.
   - `state_unreadable`: the state file cannot be read and **cannot be re-armed**. Restore the newest daily backup (`restore-k8s.sh --components risk`), or copy `state.json` and `paper-ledger.json` out of the pod (`kubectl cp`), then either repair `state.json` from that copy, or remove both files together (state and paper ledger start flat, switch on `state_missing`), then restart the pod.
3. Re-arm with a reason that says what you checked; it goes to the log with the actor.

## ReconciliationMismatch

The service state and the broker differ (a position, an open order, or a balance beyond 0.1 % of allocated capital). The service never fixes its store: the global switch is on and the pod is not ready.

1. Read the `reconciliation.mismatch` log line (`diffs`: `position:<symbol>`, `open_orders`, `balance`).
2. Paper mode: compare `state.json` and `paper-ledger.json`. Someone or something changed one of them (restore of one file only, manual edit, crash between the two writes of a fill).
3. Copy both files out of the pod (the daily backup may be older than the mismatch), decide which side is right, make the other file match it (or remove both together to start flat), restart the pod, check `ready: true`, then re-arm.
4. Broker unreachable instead (`reconciliation.error` log line, pod not ready, intents rejected `not_reconciled`): this alert does not fire (`risk_reconciliation_mismatch` stays 0); no switch is engaged; the service retries at every tick and is ready again once a reconciliation passes.

## RiskRejectRatioHigh

More than 50% of the intents were rejected over 15 min (no alert without traffic). Dashboard `risk-execution`: panel "Rejects by reason" names the cause.

1. `price_band`, `price_gap`, `stale_intent`: the decision consumer sends prices far from the market or old decisions; check it. `stale_price`: the service cannot read a price newer than 15 min from financial-scraper; check the feed ([runbook-market-data-stale](runbook-market-data-stale.md)).
2. `global_exposure`, `instrument_exposure`, `loss_limit_*`: a limit is close (panels "Exposure" and "Daily loss"); this is the limit working, check the strategy.
3. `not_reconciled`, `kill_switch`: see the sections above.

## DecisionIntentsRejected

Three or more intents of the decision consumer rejected in an hour with the same `reason` label (`decision_intents_total{outcome="rejected"}`; the reasons are those of risk-execution, `risk_orders_total`). The consumer decides once per closed bar, so this is a pattern, not noise.

1. Read the `Intent rejected by risk-execution` log lines of `decision-consumer` (symbol, model, reason).
2. `price_band`, `price_gap`, `stale_intent`: the bar read from financial-scraper is far from the price risk-execution reads, or old; check the feed ([runbook-market-data-stale](runbook-market-data-stale.md)).
3. A rejected buy (`instrument_exposure`, `global_exposure`) is a finding: the consumer bounds buys and sales on the real position (`GET /positions/:symbol`, ADR-0087 §3), so risk-execution limits tighter than the model's cap are the usual cause.
4. `instrument_exposure`, `global_exposure`, `max_quantity`: the size of the model exceeds a limit of risk-execution; the limit stays, lower `PROMOTED_MODELS` by a PR if the model is the cause.

## RiskMarketDataStale

A price older than 15 min on an allowed instrument that already had one: that symbol is switched off, the global switch when every priced symbol is stale. An instrument never priced (financial-scraper has no candle of it) is not stale. Intents decided on a price older than 1 min are rejected without engaging anything.

1. The service reads the last closed candle of each instrument from financial-scraper at every tick: check the `prices.error` log lines, then [runbook-market-data-stale](runbook-market-data-stale.md) for the feed.
2. When fresh prices flow, re-arm the symbol (and the global switch if engaged).

## RiskTickFailing

The periodic tick threw for 5 min (`risk tick failed` log line, counter `risk_tick_failures_total`). Gauges are still republished from memory, so a switch engaged during the failure shows in `KillSwitchEngaged`; what is lost is persistence.

1. Read the `risk tick failed` error: PVC full or read-only (`df` in the pod), broker unreachable, state file unwritable.
2. Fix the cause, then check `GET /admin/status`. Copy `state.json` out of the pod before restarting (the daily backup may be older).

## RiskOutboxPending

Order or kill switch events the bus refused wait in the outbox file (gauge `risk_outbox_pending`, `risk event kept for replay` and `risk outbox replay stopped` log lines). They replay at every tick and at restart; past 1000 the oldest is dropped (`RiskOutboxDropped`).

1. Find why the bus refuses: Redis down or failing over, or an ACL error (`WRONGPASS`, `NOPERM` in the `risk outbox replay stopped` error).
2. Fix the bus. The next tick replays the file and the gauge returns to 0.

## RiskOutboxDropped

The outbox hit 1000 events: the oldest were dropped (`risk outbox full: oldest event dropped` error log, counter `risk_outbox_dropped_total`). Those order or kill switch events are missing from the audit chain (ADR-0027).

1. Read the `dropped` field of each log line: it holds the full event (topic, fields, `eventId`).
2. Fix the bus as in [RiskOutboxPending](#riskoutboxpending).
3. Record the lost events (order transitions, kill switch changes) in the incident log; they cannot be replayed.

## Drill

Before paper trading, every quarter, before live and after any change to the service, its limits or its broker adapter: run the scenario of policy §7 (`services/risk-execution/tests/drill/kill-switch-drill.spec.ts` for the code path) and log the result in [risk-drill-log](../../compliance/risk-drill-log.md). A failed step blocks paper and live trading until a passing re-run.
