# decision-consumer

Paper decision loop ([ADR-0087](../adr/0087-paper-decision-consumer.md)): plays the promoted models on the last closed bar and sends the resulting order to `risk-execution`. It holds no broker key and never touches the kill switch or the mode (paper only).

## Loop

Every `DECISION_TICK_MS` (default 10 s), for each model of `PROMOTED_MODELS` (`symbol@version,…`, empty by default: nothing decides):

1. Load once: manifest from trader-trainer, then weights, sha256 checked against the manifest and the `x-model-sha256` header. Skipped unless `admission.admissible` is true and the replay interval is 1 minute or 1 day.
2. Audit once: publish `RiskEvent.PromotionLoaded` (`risk.promotion.loaded`: symbol, version, sha256) on the bus (Redis journal, ADR-0073). A refused publication means no decision (fail closed).
3. Decide once per closed bar: read the `DECISION_WINDOW_BARS` candles before the decided bar, plus that bar (N+1 candles), from financial-scraper, run `decideOnLastBar` of [model-runtime](./model-runtime.md).
4. Size the order: a sale is bounded by the real position (`GET /positions/:symbol` of risk-execution), a buy by what is left of the model's exposure cap. No room: counted as `hold`, nothing sent.
5. `POST /intents` to risk-execution. Decision id `symbol@version:<bar open ms>`: the same bar and model give the same id, so a restart is deduplicated.

A failure of one model is logged and counted (`decision_skipped_total{reason}`); it never stops the others.

## Metrics and alert

- `decision_intents_total{outcome,reason}`, `decision_skipped_total{reason}`.
- Alert `DecisionIntentsRejected`: [runbook](../operations/runbooks/runbook-risk-execution.md#decisionintentsrejected).

## Configuration

`PROMOTED_MODELS`, `DECISION_TICK_MS`, `DECISION_WINDOW_BARS`: see [ENV.md](../deployment/ENV.md). Callers allowed on risk-execution: `decision-consumer` and the operator only (403 otherwise).
