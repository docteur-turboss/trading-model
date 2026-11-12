# ADR-0064: Risk and Execution Context, Independent of the Model, Required Before Any Order Flow

**Status:** Proposed
**Date:** 2026-11
**Related:** [ADR-0049](./0049-downstream-context-for-models-and-signals.md) (downstream context, options B and C), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (walk-forward criteria, paper trading), [ADR-0011](./0011-spiffe-spire-workload-identity.md) (identities), [ADR-0016](./0016-shared-contracts-ownership.md) (shared contracts), [ADR-0039](./0039-configuration-feature-flags.md) (flags), [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) (audit trail), [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md) (no unreachable code), [ADR-0061](./0061-n-1-compatibility-of-public-api-and-bus-messages.md) (N-1 messages)

This ADR is a proposal: the owner decides. It creates no service, no package, no contract and no manifest, and adds no code (ADR-0029). **Live execution stays forbidden** until every prerequisite of section 9 is met and this ADR is Accepted.

## Context

The platform has no order chain. Of signal → decision → sizing → pre-trade checks → submission → acknowledgement → fill → position, only the decision exists, inside the trainer simulator (`services/trader-trainer/src/domain/env/trade-executor.ts`). Checked on `1ade1a18`:

- No order code: `placeOrder`, `createOrder`, `/api/v3/order`, `X-MBX-APIKEY`, `BINANCE_API_KEY`, `testnet`, `killSwitch`, `stopLoss` have no occurrence in `services/*/src`. Real loss possible today: none, since nothing reaches an exchange.
- [ADR-0049](./0049-downstream-context-for-models-and-signals.md) (Proposed) defines the contract of a model consumer but says "Live execution is out of scope" and sets no risk layer. A consumer that executes (its option C) would start from nothing and expose 100 % of the allocated capital.
- The only "kill switch" in the code is a fitness flag (`FEATURE_RISK_ADJUSTED_FITNESS`, ADR-0039): it changes how the GA scores agents and stops nothing.
- `docs/compliance/algorithmic-trading-compliance.md` §6 suggested pre-trade checks as "order validation middleware in api-gateway" and a kill switch as a "circuit breaker webhook at gateway level". The gateway only proxies the `PUBLIC_ROUTES` of external callers and calls services with its own SVID; an order sent service to service never crosses it, so a control placed there is bypassed by design.

The audit of trading risk (2026-11-11, score 9/100, "live trading forbidden") rates the execution controls 0 to 10/100. Root cause: the project is a research platform and execution was never designed. This ADR fixes the architecture of the layer that must exist before any order flow, paper or live. The loss limits (daily loss, drawdown) and the global exposure cap belong to the [loss limits and kill switch policy](../compliance/risk-limits-policy.md) (issue #882), not here; the other pre-trade caps of section 2 are set by the project owner in the service configuration.

## Decision (proposed)

Each control below states what it does, where it lives, what triggers it, and the test or drill that will prove it. "Spec" means a Jest spec of the future service (run by `bun run test`); "drill" means a scripted exercise on the paper environment whose result is recorded in a runbook.

### 1. A Risk/Execution context separate from the model and from the decision consumer

| Aspect | Rule |
| --- | --- |
| Control | One component owns every order: it receives order intents, applies sections 2 to 7, talks to the broker, and keeps the order and position state. Nothing else holds broker credentials or sends an order. |
| Location | Its own process (a service, `risk-execution`), its own SPIFFE identity and ACL (ADR-0011), its own durable store. The decision consumer (ADR-0049 option B or C) and the model never call the broker: they send an intent (instrument, side, quantity, limit price, reference price and its timestamp, decision id) to this service. The intent and order event types go in `@trading-model/contracts` (ADR-0016) and follow the N-1 rule (ADR-0061). |
| Trigger | Every order, without exception. The service ACL accepts intents only from the decision consumer identity; the gateway never exposes its routes (`PUBLIC_ROUTES` excluded). |
| Proof | Spec: an intent from any other SPIFFE ID gets 403. `api:check` keeps its routes out of `PUBLIC_ROUTES`. Review: no broker client or credential outside the service (`deps:check` and a grep gate on the broker host and key names). |

The model can be wrong, retrained or replaced at any time; the limits must hold whatever it outputs. A separate process means a model bug, a crash loop or a compromised decision consumer cannot lift a limit or reach the broker.

### 2. Mandatory pre-trade checks

Every limit has a hard ceiling in code that configuration cannot raise, and a configured value at or below it. The configuration is validated at startup (Zod, like every service config): a missing or out-of-range value refuses to start (fail closed). Every check runs before the order is written as `accepted`; any failure rejects the intent with a reason code, records it, and sends nothing.

| Check | Rule | Trigger | Proof |
| --- | --- | --- | --- |
| Allowed instruments | Allow-list of symbols; anything else rejected. Spot only: margin, futures and short selling need their own ADR | Every intent | Spec: unlisted symbol rejected |
| Max size per order | Quantity and notional (quantity × reference price) caps per instrument | Every intent | Spec: cap + 1 rejected, cap accepted; config above the hard ceiling refuses to start |
| Price band | Limit price within a band around the reference price; no order without a reference price; a market order is checked on the reference price and the notional cap | Every intent | Spec: price outside the band rejected; missing reference rejected |
| Exposure per instrument | Position after fill (open orders counted as filled) ≤ cap | Every intent | Spec with open orders pending |
| Global exposure | Sum of notionals across instruments ≤ cap | Every intent | Spec across two instruments |
| Leverage | Exposure / equity ≤ 1 (spot, no borrowing) until an ADR allows more | Every intent | Spec |
| Balance | Available balance, minus what open orders reserve, covers the order and its fee | Every intent | Spec with a reserved balance |
| Duplicates | Same client order id rejected; same instrument, side and quantity within a short window rejected unless the intent says otherwise | Every intent | Spec: replayed intent rejected, no second broker call |
| Order rate | Max orders per instrument and globally per time unit (RTS 6, quote stuffing) | Every intent | Spec with a fake clock |
| Kill switch and halts | Rejected while the kill switch (section 5) or a halt (section 7) is on | Every intent | Spec |

### 3. Order lifecycle, idempotency, acknowledgement

| Aspect | Rule |
| --- | --- |
| States | `received` → `rejected` (pre-trade) or `accepted` → `submitted` → `acknowledged` or `broker_rejected` or `unknown` → `partially_filled` → `filled`; `cancel_requested` → `cancelled`; `expired`. Transitions are a closed table in the domain; any other transition is an error. Only `rejected`, `broker_rejected`, `filled`, `cancelled` and `expired` are final. |
| Idempotency key | The client order id is derived from the decision id and written in the order store (unique key) **before** submission. It is sent as the broker client order id (Binance `newClientOrderId`). A retry after a crash or timeout reuses the same id. |
| Acknowledgement | A submission without an answer within the timeout goes to `unknown`. An `unknown` order is never resent: the service queries the broker by client order id and resumes from what the broker says. |
| Partial fills | Each fill updates the position from the broker fill (quantity, price, fee), never from the requested quantity. The remainder stays open until filled, cancelled or expired. |
| Rejection, cancellation | A broker rejection is final for that client order id. Cancellation is always allowed, including while the kill switch is on. |
| Record | Every transition is published as an event and kept by audit-logger in the hash chain (ADR-0027), with the mode (`paper` or `live`). |
| Proof | Specs: transition table (every illegal transition fails), crash between `accepted` and `submitted` then restart (same client order id, one broker order), timeout to `unknown` then broker query (no resend), partial fills summed from fills. Drill: kill the pod during submission on paper, check one order at the broker. |

### 4. Reconciliation with the broker, stop on mismatch

| Aspect | Rule |
| --- | --- |
| Control | Compare positions, balances and open orders of the service store with the broker account. |
| Location | Inside the Risk/Execution service, the only holder of the broker credentials. |
| Trigger | At startup, before accepting any intent (the service stays not ready until the first reconciliation passes); periodically (interval set by the #882 policy); after every `unknown` order. |
| On mismatch | Any difference beyond a tolerance (rounding, fees) engages the kill switch (section 5) with the reason `reconciliation`, raises an alert, and keeps the broker state for the operator. The service never "fixes" its store silently to match. |
| Proof | Spec with a fake broker reporting an extra position: kill switch on, alert metric set. Drill on paper: change the paper ledger behind the service, check the halt and the alert. Alert rule and promtool case in `tests/alerts/alerting.test.yml`. |

### 5. Kill switch, outside the decision component

| Aspect | Rule |
| --- | --- |
| Control | One switch that stops new orders and cancels open orders ([policy](../compliance/risk-limits-policy.md) §4.1). Closing positions is a separate, explicit operator action. |
| Location | The Risk/Execution service owns its state, in its durable store: a restart keeps it on, and an unreadable state counts as on (fail closed). The decision consumer and the model cannot read or change it. Last resort outside the service: revoke the broker API key, or delete the service SPIRE entry so it loses its identity. |
| Triggers | Operator (an authenticated admin route, actor recorded in the audit trail); automatic: loss limits and drawdown (values in issue #882), reconciliation mismatch (section 4), stale data beyond the halt threshold and reject storm (section 7). Switching it off is always manual and recorded. |
| Not | Not a feature flag of the gateway or of the model (ADR-0039 flags are read at startup and change behaviour, they do not stop a running order flow), not `FEATURE_RISK_ADJUSTED_FITNESS`. |
| Proof | Specs: every trigger engages it; it survives a restart; an unreadable state rejects intents; cancellation still works. Drill (frequency set by #882): engage it on paper while orders flow, measure the time to the last order sent, restart the pod, check it stays on. |

### 6. Paper and live separation

| Aspect | Rule |
| --- | --- |
| Control | Same code in both modes. Only the broker adapter differs behind one port: a simulated broker (or the exchange testnet) in paper, the real exchange in live. |
| Location | An execution mode read at startup (`paper` by default). `live` is accepted only when the deployment environment is production; the service refuses to start in any other combination: `live` outside production, `live` without live keys, `paper` with live keys present. |
| Keys | Live broker keys exist only in the production Secret (SealedSecret), never in compose, staging, CI or `.env.example`. Paper keys (testnet) cannot place a real order. |
| Trace | Every order, event, metric and log line carries the mode. |
| Proof | Specs on the startup check (each forbidden combination refuses to start). A K8s overlay check (`tests/k8s/check-overlays.mjs`) that only the production overlay may set `live`. |

### 7. Stale market data and abnormal markets

| Case | Rule | Location and trigger | Proof |
| --- | --- | --- | --- |
| Stale data | An intent carries the timestamp of the price it was decided on; older than a maximum age, it is rejected. The service also checks the age of its own reference price. Beyond a longer threshold, new orders halt until fresh data returns (same idea as `TRAINER_MAX_DATA_AGE_MS` in the trainer). | Every intent; periodic check of the feed | Spec with a fake clock; drill: stop the market data feed on paper, check rejections then the halt and the `MarketDataStale` alert |
| Trading halt | Instrument not in trading status at the exchange: reject | Every intent, from the exchange instrument status | Spec with a halted symbol |
| Gap | Reference price moved more than the band since the decision: reject (the price band of section 2) | Every intent | Spec |
| Reject storm | N broker rejections or errors within a window: kill switch with the reason `rejects` | Every broker answer | Spec |
| Broker unreachable | No resend, orders in flight go to `unknown`, reconciliation on recovery before any new intent | Every submission | Spec; drill: cut egress to the broker on paper |

### 8. Where the context sits: options

| Option | What it is | Advantages | Drawbacks |
| --- | --- | --- | --- |
| **A. Dedicated service** (recommended) | `risk-execution` as above, separate from the decision consumer | Limits hold whatever the model or the consumer does; one holder of broker keys; its own identity, ACL, alerts and rollout | One more deployable, one more hop of latency (irrelevant at this trading frequency) |
| B. Module of the decision consumer | Risk and broker code inside the ADR-0049 consumer | Fewer moving parts | A consumer bug or compromise lifts the limits; broker keys share a process with model code; the kill switch is in the component it must stop |
| C. api-gateway middleware | Former §6 suggestion | None for this purpose | The order path is service to service and never crosses the gateway; mixes public ingress and trading |
| D. Exchange-side limits only | Rely on the broker's own limits | No code | Not configurable per strategy, no reconciliation, no kill switch we control; useful as an extra layer only |

**Recommendation: A.** The independence from the model is the point of the layer; B to D give it up.

### 9. Milestones and what each one requires

Order of milestones: ADR-0049 option B (offline inference, no order) → paper trading for at least 30 days → live. No milestone is skipped.

| Requirement | Before paper | Before live |
| --- | --- | --- |
| Section 1: separate service, identity, ACL | Required | Required |
| Section 2: every pre-trade check | Required | Required, global exposure cap from the #882 policy, other caps set by the project owner in the service configuration |
| Section 3: lifecycle, idempotency, `unknown` handling | Required | Required, crash drill passed |
| Section 4: reconciliation | Required, against the paper ledger or testnet | Required, against the real account |
| Section 5: kill switch | Required, drill passed | Required, drill passed in the last period set by #882 |
| Section 6: paper/live lock | Required | Required, live keys in production only |
| Section 7: stale data and abnormal markets | Required | Required, drills passed |
| Loss limits and kill switch policy (issue #882) | Values set | Values set and reviewed |
| ADR-0030 walk-forward criteria met | — | Required, paper trading ≥ 30 days included |
| `algorithmic-trading-compliance.md` §6 prerequisites (Binance terms, annual review…) | — | Required |
| This ADR Accepted with a `**Verified by:**` line | — | Required |

## Consequences

- Until the owner accepts this ADR, nothing changes in the code or the manifests. `algorithmic-trading-compliance.md` §6 and `bounded-contexts.md` point here instead of suggesting controls in the api-gateway.
- If the owner accepts option A, a follow-up change creates the service, its contracts, identity, ACL, alerts and runbooks, with the specs and drills listed above, and this ADR moves to Accepted with a `**Verified by:**` line naming them. Choosing between ADR-0049 options B and C stays a separate decision.
- A decision consumer added before this layer must not hold broker credentials or send orders: an executing consumer without it would expose 100 % of the allocated capital.
