# Runbook: Risk/Execution Kill Switch, Reconciliation, Stale Prices

**Severity:** L1 (`KillSwitchEngaged`, `ReconciliationMismatch`), L2 (`RiskMarketDataStale`)
**Alerts:** `KillSwitchEngaged`, `ReconciliationMismatch`, `RiskMarketDataStale`
**Decision:** [ADR-0064](../../adr/0064-risk-and-execution-context-before-order-flow.md) · **Policy:** [risk-limits-policy](../../compliance/risk-limits-policy.md) · **Drill log:** [risk-drill-log](../../compliance/risk-drill-log.md)

`risk-execution` owns every order (paper only: simulated broker, no live adapter). The switch state is in `/data/risk-execution/state.json` on its PVC. Nothing re-arms the switch except an operator, by hand.

## Operate the service

The admin routes accept only the service's own identity, so run them from the pod (the `kubectl exec` right is the authentication):

```bash
POD=$(kubectl get pods -n trading-model -l app.kubernetes.io/component=risk-execution -o jsonpath='{.items[0].metadata.name}')
CURL="curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem -H content-type:application/json https://localhost:3000"
kubectl exec -n trading-model "$POD" -c risk-execution -- sh -c "$CURL/admin/status"
# Engage (scope global, or symbol + "symbol":"BTCUSDT"):
kubectl exec -n trading-model "$POD" -c risk-execution -- sh -c "$CURL/admin/kill-switch -d '{\"scope\":\"global\",\"reason\":\"<why>\",\"actor\":\"<you>\"}'"
# Re-arm, after checking that the cause is gone:
kubectl exec -n trading-model "$POD" -c risk-execution -- sh -c "$CURL/admin/kill-switch/rearm -d '{\"scope\":\"global\",\"reason\":\"<what you checked>\",\"actor\":\"<you>\"}'"
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
4. Broker unreachable instead (`reconciliation.error` log line, pod not ready, intents rejected `not_reconciled`): no switch is engaged; the service retries at every tick and is ready again once a reconciliation passes.

## RiskMarketDataStale

A price older than 15 min on an allowed instrument that already had one: that symbol is switched off, the global switch when every priced symbol is stale. An instrument never priced (no decision consumer yet) is not stale. Intents decided on a price older than 1 min are rejected without engaging anything.

1. The decision consumer pushes prices (`POST /prices`) and sends reference prices with each intent: check it is running, then [runbook-market-data-stale](runbook-market-data-stale.md) for the feed.
2. When fresh prices flow, re-arm the symbol (and the global switch if engaged).

## Drill

Before paper trading, every quarter, before live and after any change to the service, its limits or its broker adapter: run the scenario of policy §7 (`services/risk-execution/tests/drill/kill-switch-drill.spec.ts` for the code path) and log the result in [risk-drill-log](../../compliance/risk-drill-log.md). A failed step blocks paper and live trading until a passing re-run.
