# Loss Limits and Kill Switch Policy

> **Applies to:** any order flow, paper or live (none exists today)  
> **Regulatory framework:** MiFID II Art. 17, RTS 6 Art. 12 (kill functionality) and Art. 15-17 (limits, monitoring)  
> **Architecture:** [ADR-0064](../adr/0064-risk-and-execution-context-before-order-flow.md) (Proposed)  
> **Last review:** 2026-11-12

> **Status: Not implemented, prerequisite to any live execution.** The platform places no order, paper or live. No loss limit and no kill switch exist in the code: `maxDrawdown` is a metric of the model manifest and of the training events (`packages/contracts/src/training-events.ts`), never a limit, and the only flag named "kill switch" in the code (`FEATURE_RISK_ADJUSTED_FITNESS`, [ADR-0039](../adr/0039-configuration-feature-flags.md)) changes how the GA scores agents and stops nothing. Every number below is a **proposed default**, not a value read from the code: the project owner validates or changes each one before paper trading starts (ADR-0064 §9).

## 1. Purpose

Bound the loss of any order flow, including the worst case where the operator is absent, and define the switch that stops it. ADR-0064 decides where these controls live; this policy sets their values, triggers and drill.

## 2. Definitions

| Term | Meaning |
|---|---|
| Allocated capital | The amount the owner assigns to the order flow, per mode (`paper`, `live`). Every limit is a percentage of it, so the limits scale with it. Changing it is a limit change (§3). |
| Equity | Cash plus open positions marked to the reference price, minus fees paid. Losses are measured on equity, realised and unrealised together. |
| High-water mark | Highest equity since the allocated capital was last set. |
| Trading day | 00:00 to 24:00 UTC. |
| Operator | The project owner, or a person the owner names in writing. The project has a single owner and no on-call rota today: naming at least one reachable operator besides the owner is a prerequisite to live trading. |
| Risk/Execution service | The component of ADR-0064 §1 that owns every order. The decision consumer and the model are outside it. |

## 3. Loss limits

| Limit | Proposed default | Measured on | Effect when reached |
|---|---|---|---|
| Daily loss | 2 % of allocated capital | Equity at 00:00 UTC minus current equity | Global kill switch |
| Drawdown stop | 10 % of allocated capital | High-water mark minus current equity | Global kill switch; re-arming also requires the owner's review of the strategy (§4.4) |
| Daily loss per symbol | 1 % of allocated capital | Loss of the symbol's position and fees since 00:00 UTC | Kill switch of that symbol |

The limits are checked on every fill and on every reference price update, and before every intent: an intent whose worst case (fill at the limit of the price band) would cross a limit is rejected (ADR-0064 §2). The daily figures restart at 00:00 UTC, but a switch engaged by a limit stays on until an operator re-arms it (§4.4).

### 3.1 Global exposure cap

| Cap | Proposed default | Measured on | Effect |
|---|---|---|---|
| Global exposure (ADR-0064 §2) | 30 % of allocated capital | Sum of the notionals of all positions, open orders counted as filled | An intent that would cross it is rejected |

This cap is set here because it bounds the loss once the kill switch is on (§6). The other pre-trade caps of ADR-0064 §2 (size per order, price band, exposure per instrument, order rate) are not set by this policy: the project owner sets them in the Risk/Execution service configuration, with the same change process as below, at or below the global exposure cap.

**Change owner.** Only the project owner sets or changes a limit, the global exposure cap or the allocated capital. A change is a reviewed pull request that updates this table and the service configuration together; it takes effect at the next deployment and is recorded in the audit trail. A limit above the hard ceiling in code (ADR-0064 §2) is impossible without changing the code; a lower limit can be set at any time. The values are reviewed with the annual review of [algorithmic-trading-compliance.md](algorithmic-trading-compliance.md) (§6 item 10) and after any engagement of the drawdown stop.

## 4. Kill switch

### 4.1 Scope and effect

| Scope | Effect |
|---|---|
| Global | No new order on any symbol. Open orders are cancelled. Positions are kept unless the operator explicitly asks to close them. |
| Per symbol | Same, limited to one symbol. Other symbols keep trading within their limits. |

Closing positions is a separate, explicit operator action, never automatic: a forced market close in a fast or illiquid market can lose more than holding. Cancelling orders stays possible while the switch is on.

### 4.2 Manual triggers

| Who | How |
|---|---|
| Operator (§2) | Authenticated admin route of the Risk/Execution service (not exposed by the api-gateway, ADR-0064 §1); actor and reason recorded in the audit trail |
| Same, when the service is unreachable | Revoke the broker API key at the exchange, or delete the SPIRE entry of the service so it loses its identity (ADR-0064 §5) |

### 4.3 Automatic triggers

| Trigger | Proposed default | Scope |
|---|---|---|
| Daily loss, drawdown stop | §3 | Global |
| Daily loss per symbol | §3 | Symbol |
| Stale market data | Reference price of a symbol older than 15 min (the trainer's `TRAINER_MAX_DATA_AGE_MS` default); every symbol stale at once engages the global switch | Symbol, or global |
| Reconciliation mismatch | Any position or open order difference with the broker, or a balance difference above 0.1 % of allocated capital (rounding and fees), found by a reconciliation run every 5 min, at startup and after any order in state `unknown` (ADR-0064 §4) | Global |
| Reject rate | 5 broker rejections or errors within 10 min on one symbol engage that symbol; 10 within 10 min across symbols engage the global switch | Symbol, or global |
| Unreadable switch state | The service cannot read its stored state: it counts as on (fail closed, ADR-0064 §5) | Global |

Below the stale data threshold, an intent decided on a price older than 1 min is rejected without engaging the switch (ADR-0064 §7).

### 4.4 Re-arming

Re-arming is manual only, through the admin route, by an operator (§2), with a reason recorded in the audit trail. Nothing re-arms the switch automatically: not a new trading day, not a restart, not fresh data. Before re-arming, the operator checks that the cause is gone (data fresh again, reconciliation clean, rejection cause understood). After the drawdown stop, only the project owner re-arms, once the strategy has been reviewed.

## 5. Independence from the decision component

The kill switch and the limits live in the Risk/Execution service, outside the model and the decision consumer ([ADR-0064](../adr/0064-risk-and-execution-context-before-order-flow.md) §1 and §5). The decision side can neither read nor change them, so a model bug, a crash loop or a compromised consumer cannot lift a limit. The switch state survives restarts. Not a kill switch: an api-gateway control (the order path never crosses the gateway), a feature flag read at startup (ADR-0039), or `FEATURE_RISK_ADJUSTED_FITNESS`.

## 6. Operator absent: worst case

The automatic triggers stop new orders and cancel open orders; they do not close positions (§4.1). The loss of an unattended period is therefore the limit reached (2 % daily, 10 % drawdown, plus slippage between the trigger and the cancellation of open orders) **plus the loss of the positions still held**, which stay exposed to the market until an operator acts. Those positions are at most the global exposure cap (§3.1, 30 % of allocated capital), and the spot-only, no-leverage rule of ADR-0064 §2 means they cannot lose more than their notional. The worst case with no operator is thus bounded by the drawdown stop plus the global exposure cap: up to 40 % of allocated capital with the proposed defaults, not by the loss limits alone. The stale data, reconciliation and reject triggers cover the cases where the loss cannot be measured. If the Risk/Execution service itself is down, no new order is sent (it is the only holder of the broker keys), but open positions stay exposed the same way: the service must therefore hold no resting order without an expiry, and its down alert pages an operator (§2).

A tighter bound needs positions reduced without an operator, for example stop orders resting at the exchange or a forced close on the drawdown stop. That would change §4.1 and ADR-0064 §5, and it trades the bound against a forced sale in a fast or illiquid market: it is a decision for the project owner, not taken by this policy. Until then, the owner sizes the allocated capital and the global exposure cap so that this worst case is acceptable.

## 7. Drill

| Aspect | Rule |
|---|---|
| When | Before paper trading starts; then every quarter; before live trading (a drill passed within the last 90 days, ADR-0064 §9); after any change to the Risk/Execution service, its limits or its broker adapter |
| Where | Paper environment (simulated broker or exchange testnet), never with live keys |
| Scenario | 1. Run an order flow on at least two symbols. 2. Engage the per-symbol switch manually: that symbol stops, the other trades. 3. Engage the global switch manually: no new order, open orders cancelled. 4. Restart the service: the switch stays on. 5. Try to re-arm with an identity other than an operator: refused. 6. Re-arm manually. 7. Force each automatic trigger in turn: a loss past the daily limit (fake prices), stale data (stop the feed), a reconciliation mismatch (change the paper ledger), a reject storm (fake broker rejecting). |
| Evidence | A dated entry with: the time from trigger to the last order sent and to the last open order cancelled, the audit trail records of each engagement and re-arming, the alert raised for each automatic trigger, the restart result, and the operator. Kept in a drill log under `docs/compliance/`, in the format of [dr-exercise-log.md](dr-exercise-log.md), created with the Risk/Execution service. A failed step blocks paper or live trading until a passing re-run. |

No runbook exists yet: it comes with the Risk/Execution service, as do the alerts and specs of ADR-0064.

## 8. Status

| Control | Status |
|---|---|
| Loss limits and global exposure cap (§3) | ❌ Not implemented, prerequisite to any live execution |
| Kill switch, manual and automatic (§4) | ❌ Not implemented, prerequisite to any live execution |
| Drill (§7) | ❌ Never run: nothing to exercise |
| Proposed values | ⏳ To be validated by the project owner before paper trading |
