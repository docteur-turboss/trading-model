# Runbook: Risk/Execution Kill Switch, Reconciliation, Stale Prices

**Severity:** L1 (`KillSwitchEngaged`, `ReconciliationMismatch`), L2 (`RiskRejectRatioHigh`, `RiskMarketDataStale`)
**Alerts:** `KillSwitchEngaged`, `ReconciliationMismatch`, `RiskRejectRatioHigh`, `RiskMarketDataStale`
**Decision:** [ADR-0064](../../adr/0064-risk-and-execution-context-before-order-flow.md) · **Policy:** [risk-limits-policy](../../compliance/risk-limits-policy.md) · **Drill log:** [risk-drill-log](../../compliance/risk-drill-log.md)

`risk-execution` owns every order (paper only: simulated broker, no live adapter). The switch state is in `/data/risk-execution/state.json` on its PVC. Nothing re-arms the switch except an operator, by hand.

## Operate the service

`GET /admin/status` accepts only the service's own identity: run it from the pod. Engaging and re-arming go through the gateway with an API key of scope `risk:admin`: the key name is the actor recorded in the audit trail, and the owner is the key named `RISK_OWNER_ACTOR` (default `owner`). Without the gateway (down), no one can engage or re-arm.

```bash
POD=$(kubectl get pods -n trading-model -l app.kubernetes.io/component=risk-execution -o jsonpath='{.items[0].metadata.name}')
CURL="curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem -H content-type:application/json https://localhost:3000"
kubectl exec -n trading-model "$POD" -c risk-execution -- sh -c "$CURL/admin/status"
# Engage (scope global, or symbol + "symbol":"BTCUSDT"):
API=https://<edge-proxy host>/v1/risk-execution/admin
curl -s -H "x-api-key: <your risk:admin key>" -H content-type:application/json $API/kill-switch -d '{"scope":"global","reason":"<why>"}'
# Re-arm, after checking that the cause is gone:
curl -s -H "x-api-key: <your risk:admin key>" -H content-type:application/json $API/kill-switch/rearm -d '{"scope":"global","reason":"<what you checked>"}'
```

Service unreachable, last resort: revoke the broker API key at the exchange, or delete the SPIRE entry of `risk-execution` (ADR-0064 §5). Closing positions is never automatic: decide it explicitly.

## KillSwitchEngaged

1. `GET /admin/status`: `killSwitch.global` / `killSwitch.symbols` name the reason: `daily_loss`, `daily_loss_symbol`, `drawdown`, `stale_data`, `reconciliation`, `rejects`, `state_unreadable`, `operator`.
2. Check the cause is gone, then re-arm (policy §4.4):
   - `daily_loss`, `daily_loss_symbol`: the limit restarts at 00:00 UTC but the switch does not; re-arm after review.
   - `drawdown`: only the owner (`RISK_OWNER_ACTOR`) re-arms, after reviewing the strategy.
   - `stale_data`, `reconciliation`, `rejects`: see the sections below.
   - `state_unreadable`: the state file cannot be read and **cannot be re-armed**. No backup covers the `risk-execution-pvc`: first copy `state.json` and `paper-ledger.json` out of the pod (`kubectl cp`), then either repair `state.json` from that copy, or remove both files together (state and paper ledger start flat), then restart the pod.
3. Re-arm with a reason that says what you checked; it goes to the log with the actor.

## ReconciliationMismatch

The service state and the broker differ (a position, an open order, or a balance beyond 0.1 % of allocated capital). The service never fixes its store: the global switch is on and the pod is not ready.

1. Read the `reconciliation.mismatch` log line (`diffs`: `position:<symbol>`, `open_orders`, `balance`).
2. Paper mode: compare `state.json` and `paper-ledger.json`. Someone or something changed one of them (restore of one file only, manual edit, crash between the two writes of a fill).
3. Copy both files out of the pod (no backup covers the PVC), decide which side is right, make the other file match it (or remove both together to start flat), restart the pod, check `ready: true`, then re-arm.
4. Broker unreachable instead (`reconciliation.error` log line, pod not ready, intents rejected `not_reconciled`): this alert does not fire (`risk_reconciliation_mismatch` stays 0); no switch is engaged; the service retries at every tick and is ready again once a reconciliation passes.

## RiskRejectRatioHigh

More than 50% of the intents were rejected over 15 min (no alert without traffic). Dashboard `risk-execution`: panel "Rejects by reason" names the cause.

1. `price_band`, `price_gap`, `stale_intent`: the decision consumer sends bad or old reference prices; check it and the feed ([runbook-market-data-stale](runbook-market-data-stale.md)).
2. `global_exposure`, `instrument_exposure`, `loss_limit_*`: a limit is close (panels "Exposure" and "Daily loss"); this is the limit working, check the strategy.
3. `not_reconciled`, `kill_switch`: see the sections above.

## RiskMarketDataStale

A price older than 15 min on an allowed instrument that already had one: that symbol is switched off, the global switch when every priced symbol is stale. An instrument never priced (no decision consumer yet) is not stale. Intents decided on a price older than 1 min are rejected without engaging anything.

1. The decision consumer pushes prices (`POST /prices`) and sends reference prices with each intent: check it is running, then [runbook-market-data-stale](runbook-market-data-stale.md) for the feed.
2. When fresh prices flow, re-arm the symbol (and the global switch if engaged).

## Drill

Before paper trading, every quarter, before live and after any change to the service, its limits or its broker adapter: run the scenario of policy §7 (`services/risk-execution/tests/drill/kill-switch-drill.spec.ts` for the code path) and log the result in [risk-drill-log](../../compliance/risk-drill-log.md). A failed step blocks paper and live trading until a passing re-run.
