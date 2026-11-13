# ADR-0058: trader-trainer Handed Over Through a Kubernetes Lease

**Status:** Accepted
**Date:** 2026-11
**Amends:** [ADR-0044](./0044-singleton-trainer.md) (decisions 1 and 5 superseded: `Recreate` and its check; decisions 2, 3, 4 and 6 stand)
**Related:** [ADR-0057](./0057-collector-handover-through-a-lease.md) (same election for the collector), [ADR-0022](./0022-versioned-model-artifacts.md) (models on the shared checkpoint volume), [ADR-0045](./0045-single-service-resolution-strategy.md) (the gateway calls the Service, so only ready pods get requests), [ADR-0041](./0041-least-privilege-deploy-identities.md), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `packages/reliability/tests/unit/leadership.spec.ts`, `services/trader-trainer/tests/unit/leadership/non-holder-read-routes.spec.ts`, `services/trader-trainer/tests/unit/core/trainer.spec.ts`, `tests/k8s/check-overlays.mjs`, `tests/k8s/run-kind.sh`, `tests/alerts/alerting.test.yml`

## Context

ADR-0044 made `trader-trainer` a `Recreate` singleton. Each release stopped the old pod (preStop 10 s, grace 60 s), then started the new one (startup probe from 30 s). The Service had no endpoint meanwhile, so the six public read routes (best agent, models, training agents and status) failed through edge-proxy on every release; the trainer image changes with every release. Release v3.1.0 targets no service interruption on staging (issue #716). The kind availability probe only called discovery-server, so CI did not see the cut.

The read routes need no training: models are read from the ReadWriteMany checkpoint volume (ADR-0022), and the best-agent summaries are rehydrated from the newest manifests at startup (issue #533). Only the training must run on one pod.

## Decision

1. **Election by Lease.** The trainer pods compete for the Lease `trader-trainer` (env `TRAINER_LEASE_NAME`). Only its holder runs the training loop (`TrainingLeadership`, `services/trader-trainer/src/application/training-leadership.ts`). Election, adapter and timings are those of ADR-0057 (decisions 1 and 2): lease 15 s, renew deadline 10 s, retry 2 s, optimistic concurrency on `resourceVersion`. The code is a copy of the collector's (`KubernetesLease`, port `LeaderLeasePort`) with the trainer's metric and logs: two services, a small file each, no shared package for it yet.
2. **Every pod serves the read routes**, holder or not.
3. **Handover on SIGTERM.** The holder stops scheduling sessions, ends the session in flight after its current generation (an `AbortSignal` passed to the worker thread, checked by the GA runner after each generation), stores its best agent as a model version and publishes it, then releases the Lease. The successor takes it on its next attempt (2 s). A lost Lease (deadline, another holder) ends the session the same way.
4. **Rollout.** `replicas: 1`, no HPA, `RollingUpdate` with `maxUnavailable: 0` and `maxSurge: 1`: the new pod is ready, and serves reads, before the old one gets SIGTERM. `terminationGracePeriodSeconds` goes from 60 to 120 s: preStop, one generation, the store and publish.
5. **Least privilege**, as ADR-0057 decision 5: the Lease is a manifest without `spec`; the Role `trader-trainer-lease` grants `get` and `update` on that name only; it is bound to the ServiceAccount `trader-trainer`, which keeps `automountServiceAccountToken: false` while the pod template sets `true`; the NetworkPolicy `trader-trainer-apiserver` opens 443 and 6443 to private ranges.
6. **Without a Lease name** (compose, dev), the trainer trains at once, as before.
7. **Observability.** `tt_training_leader` is 1 on the pod that trains. Alert `TrainerNoLeader` (warning) fires when no trainer pod reports 1 for 5 min, `TrainerNoLeaderProlonged` (critical) after 30 min ([runbook-trainer](../operations/runbooks/runbook-trainer.md#trainernoleader)).
8. **Checks.** `check-overlays.mjs` treats the trainer as a leased singleton like the collector (strategy, `TRAINER_LEASE_NAME`, Lease, Role limited to it); it fails if the trainer goes back to `Recreate`. The kind job's availability probe (`tests/k8s/probe-availability.sh`) calls `/v1/trader-trainer/training-status` and a financial-scraper route next to discovery-server during the upgrade N-1 → N, with 0 failed requests allowed.

## Consequences

- A release no longer empties the read routes. Training pauses for the end of one generation plus up to 2 s instead of the whole restart.
- The session cut short at a release is stored and published as a model version, like one cut by the time budget (`TRAINER_TIME_BUDGET_MS`). Its agent saw fewer generations than a full session.
- A generation longer than the grace left after preStop (about 110 s) is killed with the pod: its session is lost, as before this ADR, and the Lease expires 15 s later.
- If the end of the session outlasts the 15 s Lease, the new pod may start training before the old one has stored its model: both write versions to the shared volume (ADR-0022 supports concurrent writers) and the newest wins the read routes.
- The new pod rehydrated its summaries before the old one stored the model of the cut session: until its own first training, `/best-agent` answers the previous version; `/models/:symbol` lists the new one at once (read from the volume).
- During a rollout two pods consume the market data subscription (one consumer group per service, ADR-0048): each receives part of the candles for that window. The holder's buffer starts empty after a release as before.
- The first upgrade from a release without the Lease (3.0.x → 3.1.0, trainer on `Recreate`) runs the old trainer, which has no Lease, next to the new one until the old pod stops: both may train for that window, with the effect of the previous points.
- The trainer now talks to the Kubernetes API: if it is unreachable for more than 10 s, training stops (`TrainerNoLeader` after 5 min) while the read routes keep answering.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Keep ADR-0044 (`Recreate`) | Cuts the six public read routes on every release |
| Move the lease code to a shared package | Two callers of ~300 lines; a package needs its own build, coverage and dependency graph entry. Worth it at a third caller |
| Wait for the session in flight to end instead of ending it after the generation | A session lasts up to `TRAINER_TIME_BUDGET_MS` (5 min): the grace would have to cover it |
| Separate read Deployment (HPA) and training Deployment | Two Deployments, a second ServiceAccount and Service routing for the same image; the Lease gives the same continuity with one |
