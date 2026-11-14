# Model Evaluator

**Package:** `model-evaluator`
**Path:** `services/model-evaluator/`

## Role

Offline consumer of trained models (ADR-0049, option B). No order flow, no market exposure. On each `training.model.published` it reads the manifest then the weights of the trainer, checks them, and records one evaluation per `(symbol, version)`. It copies the `admissible` verdict of the manifest (ADR-0069) and never promotes a model.

## Flow

1. message-manager delivers `training.model.published` at `POST /message` (at-least-once).
2. A record already stored for `(symbol, version)`: answer `duplicate`, nothing is read.
3. Reads the manifest, then the weights, from the versioned model routes of trader-trainer, over mTLS (its own SPIFFE identity, listed in `MODEL_DOWNLOAD_CALLERS` and in the trainer ACL).
4. The sha256 of the weights must equal the manifest, the event and `x-model-sha256`, and the length must match the manifest. Otherwise the delivery fails (retries, then the dead letter queue) and nothing is recorded.
5. The record is created exclusively (`wx`) in `EVALUATIONS_DIR/<symbol>/<version>.json`: a redelivery never overwrites it.

## Not done yet

The replay of the model on stored candles and signals, and the ADR-0030 metrics (`replay: "not-run"` in the record). It needs the network forward, the feature codec and the portfolio simulator shared with the trainer, and is a separate change (owner decision on issue #1141: option 3).

## Dependencies

| Dependency | Type |
| --- | --- |
| discovery-server | Registration, resolution of trader-trainer |
| message-manager | Subscription to `training.model.published`, delivery |
| trader-trainer | Manifest and weights (service-to-service) |
| PVC `model-evaluations-pvc` | Evaluation records (one replica, `Recreate`) |

## Configuration

`EVALUATIONS_DIR` (see [ENV.md](../deployment/ENV.md)) and the common variables.

## Metrics

`model_evaluations_total{outcome="recorded|duplicate"}`.
