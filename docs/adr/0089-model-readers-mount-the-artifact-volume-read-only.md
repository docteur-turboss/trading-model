# ADR-0089: Model Readers Mount the Artifact Volume Read-Only

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0022](./0022-versioned-model-artifacts.md) (versioned artifacts), [ADR-0044](./0044-singleton-trainer.md) (trainer singleton), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand/contract), [ADR-0069](./0069-model-admission-verdict-on-the-test-segment.md) (admission), [ADR-0016](./0016-shared-contracts-ownership.md) (shared contracts)
**Verified by:** `services/risk-execution/tests/unit/trainer-admission.spec.ts`, `packages/model-runtime/tests/unit/model-api/model-clients.spec.ts`, `bun run deps:check`

## Context

`model-evaluator` read the manifest and weights, and `risk-execution` read `admission.admissible` for every intent, through HTTP routes of `trader-trainer`. A trainer OOM, rollout or lease takeover made evaluation fail and admission answer "not admissible" (issue #1992, audit finding A5), although the artifacts sit on the ReadWriteMany volume `trainer-checkpoints-pvc`.

## Decision

Option A, chosen by the owner on 2026-11-23 (option B, an S3 object store, stays possible later behind the same reader):

- The trainer stays the only writer. `model-evaluator` and `risk-execution` mount `trainer-checkpoints-pvc` read-only (`TRAINER_MODEL_DIR`) and read through `@trading-model/model-runtime/model-artifact-reader`, which owns the file names, the version and symbol patterns, the manifest schema (`ModelManifestSchema`) and the reader. The trainer store reads through the same function.
- `risk-execution` stays fail closed: a missing version, an unreadable file or a manifest that fails the schema is "not admissible".
- Expand (this release, N): readers read the volume, and call the trainer routes only when the volume has no copy. Contract (N+1, tracked in issue #1992): remove `GET /models/:symbol/:version` and `/weights` for these callers, their ACL entries (`packages/http/src/acl-config.ts`) and the fallback.

## Consequences

- Admission and evaluation no longer depend on the trainer pod.
- Three Deployments share a file format: a change to the manifest must stay readable by N-1 readers ([ADR-0061](./0061-n-1-compatibility-of-public-api-and-bus-messages.md) rule) and goes through `ModelManifestSchema`.
- The volume is mounted by two more pods; backups are unchanged.
