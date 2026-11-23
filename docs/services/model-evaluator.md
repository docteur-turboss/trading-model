# Model Evaluator

**Package:** `model-evaluator`
**Path:** `services/model-evaluator/`

## Role

Offline consumer of trained models (ADR-0049, option B). No order flow, no market exposure. On each `training.model.published` it reads the manifest then the weights of the trainer, checks them, and records one evaluation per `(symbol, version)`. It copies the `admissible` verdict of the manifest (ADR-0069) and never promotes a model.

## Flow

1. `training.model.published` arrives at least once: read from the bus in process (`brokerMessage.on`, ADR-0073), or delivered by message-manager at `POST /message` while it exists.
2. A record already stored for `(symbol, version)`: answer `duplicate`, nothing is read.
3. Reads the manifest, then the weights, from the versioned model routes of trader-trainer, over mTLS (its own SPIFFE identity, listed in `MODEL_DOWNLOAD_CALLERS` and in the trainer ACL).
4. The sha256 of the weights must equal the manifest, the event and `x-model-sha256`, and the length must match the manifest. Otherwise the delivery fails (retries, then the dead letter queue) and nothing is recorded.
5. Replay (ADR-0079): reads the one-minute candles of the manifest window, `from` to `to` and never later, from financial-scraper, and plays the model greedily (epsilon 0) with `@trading-model/model-runtime/replay` over the test steps. The record gets `replay: "done"` with `metrics` (`policy: "greedy"`, Sharpe, Sortino, Calmar, buy and hold Sharpe of the test segment), or `replay: "failed"` with a `reason`: `no-window`, `missing-candles`, `replay-error: ...` (for example a model with signal inputs, which the candles do not carry). A candle read error records nothing: the delivery fails and the bus retries it.
6. The record is created exclusively (`wx`) in `EVALUATIONS_DIR/<symbol>/<version>.json`: a redelivery never overwrites it.

## Dependencies

| Dependency | Type |
| --- | --- |
| message-manager | Subscription to `training.model.published`, delivery |
| trader-trainer | Manifest and weights (service-to-service) |
| financial-scraper | Candles of the replay window (candles of a symbol, `/v2/candles/symbols/<symbol>`) |
| PVC `model-evaluations-pvc` | Evaluation records (one replica, `Recreate`) |

## Configuration

`EVALUATIONS_DIR` (see [ENV.md](../deployment/ENV.md)) and the common variables.

## Metrics

`model_evaluations_total{outcome="recorded|duplicate"}`; `model_replay_sharpe_gap{symbol}`: replayed minus published (`admission.criteria.sharpe`) test Sharpe of the newest replayed model; no alert: the trainer measures with 5 % exploration, the replay greedy, so a gap is expected.
