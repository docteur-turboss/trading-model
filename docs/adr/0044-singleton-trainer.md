# ADR-0044: trader-trainer Runs as a Singleton

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0042](./0042-singleton-collector-with-verified-recovery.md) (same pattern for the collector), [ADR-0024](./0024-pod-spread-across-nodes.md) (its trader-trainer row no longer applies), [ADR-0022](./0022-versioned-model-artifacts.md)
**Verified by:** `tests/k8s/check-overlays.mjs`

## Context

`Trainer` keeps its training state in the pod's memory: status, last training snapshot, per-symbol snapshots (`services/trader-trainer/src/application/trainer.ts`), and so are the market-data buffer and the training loop. The production HPA `trader-trainer-hpa` allowed 1 to 3 pods. Each pod trained every symbol on the share of the market data it received, so models diverged and CPU cost grew with the pod count. The gateway round-robins over the registered instances, so `GET /v1/trader-trainer/training-status`, `/best-agent` and `/training-agents` answered according to the pod hit (audit architecture 2026-11-06, A2, issue #501). The only shared state is the ReadWriteMany checkpoint volume (ADR-0022).

## Decision

1. `trader-trainer` runs exactly one pod: `replicas: 1`, no HorizontalPodAutoscaler, strategy `Recreate`, so a rollout never runs the old and the new trainer side by side.
2. Sizing stays vertical: the VPA `trader-trainer-vpa` (`updateMode: "Off"`) keeps recommending requests; raising them is a manifest change.
3. `deploy-release.sh release-replicas` deletes the retired `trader-trainer-hpa` before the overlay is applied (apply never prunes).
4. The trainer has no canary, like the collector: `deploy-k8s.sh canary` copies the Deployment into a second pod, which would train beside the singleton. `deploy.yml` leaves it out of `canary-all` and `canary-cleanup`.
5. `tests/k8s/check-overlays.mjs` fails when the trainer (or the collector, ADR-0042) gets an HPA, `replicas` other than 1, a strategy other than `Recreate`, or a canary in `deploy.yml`.
6. Several trainers need a new ADR first: partition by symbol (StatefulSet ordinal or a lease per symbol) and read the training state from a shared store.

## Consequences

- No horizontal scaling: one trainer's CPU bounds training throughput.
- Each release and each pod loss stops training and empties the read routes until the new pod is ready; the training state starts over, but at startup the trainer rehydrates each symbol's best-agent summary from its newest model manifest (issue #533), so the read routes answer with the last published agent (`model` carries its version) until a new training replaces it. The market buffer still starts empty. Published model artifacts stay on the checkpoint volume.
- The read routes answer the same state whatever the call.
- A canary release does not cover the trainer: its new image is first exercised by the rollout itself, and a failure there goes through the rollback step.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Partition symbols across pods (StatefulSet or lease) plus a shared state store | Changes the read API and the training loop; not needed at two symbols |
| Keep the HPA, pin `minReplicas`/`maxReplicas` to 1 | Leaves a scaling object that one edit turns back on; nothing to guard against |
| `RollingUpdate` with `maxSurge: 1` | Runs two trainers during each rollout |
