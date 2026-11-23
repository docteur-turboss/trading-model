# ADR-0086: The Compose Stack Is Deployed by the CI From Released Images

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0011](./0011-spiffe-spire-workload-identity.md) (SPIRE), [ADR-0041](./0041-least-privilege-deploy-identities.md) (deploy identities); ADR-0040 (migrations expand/contract)
**Verified by:** `bun run config:check`; manual review 2026-11-22 of the deploy-compose workflow (first run on the host pending)

## Context

Issue #2312: the compose stack of the host ran from an operator's clone, compiled from its sources, and stayed on `v3.1.0-rc.2` while `v3.1.0` was out (SPIRE agent loop, #1903/#1906). #358 had removed compose from the production docs in favour of K8s.

## Decision

- Compose is a **deployed environment**, next to `staging` (kind) and production (K8s), changed only by the `deploy-compose.yml` workflow on the self-hosted runner. It differs from `staging`: same host, plain Docker, project `trading-model`, its volumes kept across releases.
- `docker-compose.yml` has no `build:`: it names the released images. `docker-compose.build.yml` adds the builds (local dev, CI E2E).
- The workflow resolves the tag to digests (failing before any change), unpacks the tag below `COMPOSE_RELEASES_DIR`, runs `spire-bootstrap` then the migration then `up -d --wait`, smoke-tests through `edge-proxy`, and on failure reruns `spire-bootstrap`, then redeploys the images (kept under a local `trading-model-rollback/<service>:prev` tag) and the directory recorded before. The first run therefore rolls back to the operator's clone `trading-model-release`, which is then retired.
- `spire-agent` is not released (SPIRE binaries on alpine, `deploy/spire`): the workflow builds it from the tag, so it stays out of the release matrices. Accepted gap to the issue: this service has a tag, not an `@sha256:` digest.
- K8s and kind are unchanged. Secrets: `deploy/compose/secrets.env.age`, decrypted by the workflow ([COMPOSE_SECRETS.md](../deployment/COMPOSE_SECRETS.md)); the host `.env` (`COMPOSE_ENV_FILE`) is the fallback until it is committed.
