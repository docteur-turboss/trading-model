# Risk/Execution Drill Log

| Field | Value |
|---|---|
| **Document owner** | Project owner |
| **Purpose** | Versioned record of every kill switch drill: when, what ran, how long each step took, result |
| **Policy** | [Loss limits and kill switch policy](risk-limits-policy.md) § 7 (before paper, every quarter, before live, after any change to the service) |
| **Architecture** | [ADR-0064](../adr/0064-risk-and-execution-context-before-order-flow.md) § 5, § 9 |
| **Runbook** | [runbook-risk-execution](../operations/runbooks/runbook-risk-execution.md) |

Add one entry per drill, newest first, in the pull request that follows it. Never edit a past entry: add a correction under it. Format of [dr-exercise-log.md](dr-exercise-log.md).

## 2026-11-20 — Kill switch drill before paper trading (issue #1695)

| Field | Value |
|---|---|
| **Scenario** | Policy § 7, steps 1 to 7 |
| **Environment** | Paper: simulated broker (file-backed ledger), service state in files, no live key. Run in-process by `services/risk-execution/tests/drill/kill-switch-drill.spec.ts` (`bun run --filter risk-execution test`); a restart is a new `RiskExecution` on the same files |
| **Operator** | Agent session of issue #1695, for the project owner |
| **Result** | **Passed**, all steps |

| Step | Expected | Observed |
|---|---|---|
| 1. Order flow on BTCUSDT and ETHUSDT | two fills and one resting limit order per symbol | as expected |
| 2. Per-symbol switch (BTCUSDT) | BTCUSDT intents rejected `kill_switch`, its resting order cancelled, ETHUSDT keeps filling | as expected; switch to last cancellation 2 ms |
| 3. Global switch | no new order, every open order cancelled | as expected; switch to last cancellation 2 ms, intent refused after 1 ms |
| 4. Restart | switch still on, service ready, intents refused | as expected |
| 5. Re-arm by another identity (`trader-trainer`) | refused (403) | 403, switch still on |
| 6. Manual re-arm (own identity), then BTCUSDT | trading resumes | as expected |
| 7a. Loss past the daily limit (fake price) | global switch `daily_loss` | as expected |
| 7b. Stale data (clock +16 min, no price) | global switch `stale_data` | as expected |
| 7c. Reconciliation mismatch (extra position in the paper ledger) | global switch `reconciliation`, service not ready | as expected |
| 7d. Reject storm (broker rejecting, 5 in 10 min on one symbol) | symbol switch `rejects` | as expected |

**Alerts.** Not raised by a running Prometheus: `KillSwitchEngaged`, `ReconciliationMismatch` and `RiskMarketDataStale` are checked by the promtool cases of `tests/alerts/alerting.test.yml` on the gauges the service sets (`risk_kill_switch`, `risk_reconciliation_mismatch`, `risk_market_data_age_seconds`).

**What this drill does not cover, to run on the deployed paper environment before the 30 days of paper start:** a pod restart on the cluster (PVC re-mount), the admin routes through `kubectl exec`, the alerts firing in Prometheus and reaching Alertmanager, the audit trail records of each engagement (the service writes them to its log with the mode; publishing them to the audit chain is not wired yet). Log that run as a new entry.

**Correction (2026-11-22):** engagements have been published to the audit chain since #1732.

## 2026-11-22 — Kill switch drill on the deployed paper environment (issue #1733)

| Field | Value |
|---|---|
| **Scenario** | Policy § 7: switch, pod restart with the PVC, admin routes through `kubectl exec`. Alerts, reconciliation and stale-data steps: see below |
| **Environment** | Staging on local kind (`kind-trading-staging`, namespace `trading-model-staging`), `EXECUTION_MODE=paper`, PVC `risk-execution-pvc`. Image `risk-execution@sha256:7dc9032d…`: a build of `development`, not a tagged release |
| **Operator** | Agent session of issue #1733, for the project owner (`kubernetes-admin`) |
| **Result** | **Partial**: restart and admin routes passed; the three alerts did not fire; reconciliation and stale-data steps not run |

| Step (UTC) | Expected | Observed |
|---|---|---|
| 22:13:28 Baseline | no switch | `risk_kill_switch` 0 (global, symbol), `ready: true` |
| 22:13:35 `scripts/risk-admin.sh engage` (global) | switch on | `engaged`; `/admin/status` shows the reason; gauge `scope="global"` 1 |
| 22:14:27 Delete the pod | new pod, same PVC, switch still on | New pod `risk-execution-54d8fd59f6-5sjcz`, same PVC uid; at 22:17:16 `/admin/status` still shows the global switch |
| 22:17:58 `engage --symbol BTCUSDT` | symbol switch added | `engaged`, both switches in `/admin/status` |
| 22:19:06 `rearm` (symbol, then global) | initial state back | `rearmed` twice; no switch; both gauges 0 |

**Alerts: not observed.** The running `prometheus-0` has no `risk-execution` scrape job and no risk rule (`risk_kill_switch` query empty, no `KillSwitchEngaged` in Prometheus or Alertmanager). The StatefulSet is partitioned in staging-local (`partition: 1`), so the pod still mounts the 14-day-old `prometheus-config`, not `prometheus-config-t87mgk944d` which has the job (`StatefulSetStuckOnOldRevision` fires). Prometheus was not rolled during the drill. The gauges the alerts read are exposed by the service (`/metrics` from the pod at 22:13:35 and 22:19:06).

**Not run.** `ReconciliationMismatch` and `RiskMarketDataStale` (would need a hand edit of the ledger on the PVC and 15 min without prices). Policy § 7 is not satisfied until a re-run with Prometheus on the current config.

**Other observations.** After the restart the pod stayed 1/2 Ready: registration to `discovery-server` was refused (`ECONNREFUSED`), while `redis-0` was in `CrashLoopBackOff` and `discovery-server` and `message-manager` were 1/2. The admin routes answered regardless.
