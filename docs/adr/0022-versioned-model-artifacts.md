# ADR-0022: Versioned Model Artifacts Instead of Genomes in the Public API

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0001](./0001-ga-dqn-training.md) (GA + DQN training), [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) (route registries), [ADR-0011](./0011-spiffe-spire-workload-identity.md) (mTLS identities)
**Verified by:** `services/trader-trainer/tests/unit/model-artifacts/file-model-artifact-store.spec.ts`, `services/trader-trainer/tests/unit/model-artifacts/model-routes.spec.ts`, `services/trader-trainer/tests/unit/model-artifacts/model-download-guard.spec.ts`, `services/trader-trainer/tests/unit/model-artifacts/model-metrics.spec.ts`, `services/trader-trainer/tests/unit/core/trainer.spec.ts`, `services/trader-trainer/tests/integration/server.integration.spec.ts`, `bun run api:check`

## Context

`GET /v1/trader-trainer/training-agents/:symbol` returned the last generation of a symbol (`generationContext`): the whole population and archive, every genome with its trained weights. A `Float32Array` serializes to JSON as an object keyed by index, so each weight cost about 20 bytes. The route was public: any holder of a gateway API key could read every trained network. No consumer in the repository read these fields.

Meanwhile nothing kept a trained model. The best genome lived in the trainer's memory and was lost on restart. The `trainer-checkpoints` volume (ReadWriteMany, 50 Gi, encrypted daily backups by `backup-k8s.sh`) was mounted on both replicas, but no code wrote to it. Deploying or reproducing a model was impossible: the weights alone are useless without the network topology, the feature layout and the normalization statistics they were trained with.

## Decision

**After each successful training, the trainer writes the best agent of the symbol as an immutable, versioned artifact. The public API describes artifacts; it never sends weights. The weights are downloaded through a service-to-service route closed by default.**

### Artifact

Stored under `TRAINER_MODEL_DIR` (`/data/checkpoints/models` in K8s and compose):

```
<TRAINER_MODEL_DIR>/<SYMBOL>/<version>/
  manifest.json   everything needed to rebuild and run the agent, except the weights
  weights.f32     the trained weights: raw float32, little-endian, no header
```

- **Version** `<UTC yyyymmddThhmmssZ>-<first 12 hex of the weights sha256>`: sortable by time, unique across the two replicas writing to the shared volume without coordination. Two identical writes produce the same version and the same content.
- **Atomic**: files are written to a temporary directory next to the target, then renamed. A reader never sees a half-written artifact; an existing version is never overwritten.
- **Manifest** (`formatVersion: 1`): symbol, version, creation time, producing instance; the weights file (dtype, length, sha256); the genome without weights (network topology, RL and GA genes); the feature layout (`dim` and the ordered field names of the feature codec); the normalization statistics of the symbol at the end of training; the metrics of the best agent (generation, fitness, Sharpe, average PnL, max drawdown).
- **Retention**: the `TRAINER_MODEL_RETENTION` newest versions per symbol are kept (default 20), older ones are removed after each write.
- A failed write does not fail the training: it is logged (error) and counted (`tt_model_artifacts_total{result="error"}`).

### API (TRAINER_API, ADR-0021)

| Route | Exposure | Returns |
| --- | --- | --- |
| `GET /training-agents/:symbol` | public | best agent summary and `model` (latest artifact: version, sha256, creation time), **no `generationContext`** |
| `GET /models/:symbol` | public | the stored versions of a symbol, newest first, with their metrics |
| `GET /models/:symbol/:version` | public | the manifest |
| `GET /models/:symbol/:version/weights` | **service-to-service only** | `application/octet-stream`, header `x-model-sha256` |

The weights route is not in `PUBLIC_ROUTES`, so the gateway refuses it. mTLS alone is not enough: the trainer's ACL works per service and already admits api-gateway, financial-scraper, discovery-server and message-manager. A route guard checks the caller's SPIFFE identity against `MODEL_DOWNLOAD_CALLERS` (comma-separated service names), **empty by default: every caller gets 403** until a consumer (an executor) is added deliberately, with its ACL entry.

### Consequences for the existing API

`generationContext` disappears from `GET /training-agents/:symbol` (breaking change, no known consumer). The population of a generation is no longer observable through the API; `GET /training-status` and the metrics cover the progress of a training.

### Measured metrics only (2026-10-30)

The agent summary (`GET /best-agent`, `/training-agents`), the manifest metrics and the `training.model.published` event only carry measured values:

- `maxDrawdown` is the largest fall of the cumulative PnL over the agent's evaluation episodes, from its previous peak, counted from the first episode (`EpisodeScores.maxDrawdown`, the drawdown `calmar` divides by), in episode PnL units, >= 0.
- `negFlops` and `complexityPenalty` are removed from the summary, the API and the manifest (breaking change, no known consumer): they were constants (0), never measured.

**Audit trail.** Until this change, `training.model.published` sent `complexityPenalty` under the name `maxDrawdown`, so every event carried `maxDrawdown: 0` whatever the agent did. audit-logger recorded these events in its hash-chained trail, which cannot be corrected: every `training.model.published` entry recorded before the deployment of this change has a meaningless `maxDrawdown`, and must not be read as a measure.

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| Generation statistics only (no artifact) | Fixes the exposure, but a trained model still cannot be kept, deployed or reproduced |
| Population behind a signed-request route | Keeps a heavy payload and still hands weights to anyone holding the secret |
| Weights through the gateway with a signed request | Chosen against: an external tool could fetch the models; internal only keeps the surface minimal until a real consumer exists |
| Weights in the manifest (JSON) | 5× larger and lossy unless every float is printed exactly; raw float32 with a sha256 is exact and verifiable |
| Object storage (S3) | More infrastructure; the RWX volume already exists, is shared by the replicas and is backed up encrypted |

## Consequences

### Positive

- A trained agent survives restarts, is backed up (age-encrypted with the `checkpoints` component) and can be rebuilt exactly: topology, weights, feature layout, normalization.
- No weights leave the cluster through the gateway; public responses are small.
- The sha256 lets a consumer verify what it downloaded against the public manifest.

### Negative

- Breaking change on `GET /training-agents/:symbol` (`generationContext` removed), and on the agent summary (`negFlops`, `complexityPenalty` removed).
- Disk usage grows with symbols × retention × network size (a few MB per version for the current topologies).
- Nothing can download weights until `MODEL_DOWNLOAD_CALLERS` and the ACL name a consumer.
