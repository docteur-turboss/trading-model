# ADR-0018: Temporary Removal of the Admin Frontend (`admin-interface`)

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0011](./0011-spiffe-spire-workload-identity.md), [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md), [API Gateway OpenAPI](../services/openapi/README.md)
**Verified by:** `bun run api:check`

## Context

`services/admin-interface` was a React 19 + Vite + MUI SPA served by nginx. It talked to the backend only through the api-gateway, with an admin token sent as `x-api-key`. It covered the service registry, DLQ, audit events, jobs, training, market data, gateway cache and worker monitoring.

The doc/runtime drift guard added on 2026-10-27 (`bun run api:check`, `scripts/api-contract.mjs`) checks every `request("METHOD", path)` call of the SPA against the routes the gateway really serves. **None of the 24 calls reached a route.** They were frozen as known gaps in `scripts/api-contract-known-gaps.json`:

- **Wrong path prefix (10 calls):** the SPA prefixed its calls with `scraper`, `trainer`, `audit`, `discovery` and `messages/dlq`. The gateway proxies by service name: `/v1/financial-scraper/*`, `/v1/trader-trainer/*`, `/v1/audit-logger/*`, `/v1/discovery-server/*`, `/v1/dlq-service/*`.
- **Endpoints that no service exposes (14 calls):** jobs and workers, gateway cache administration, discovery config/stats and instance removal, training results and training start/stop.

So the frontend did not work against any deployed backend. Its tests stayed green because they mocked the API client. On top of that, it cost the rest of the monorepo:

- a separate toolchain (Vitest, Vite, jsdom, ESM-only workspace) with its own conventions in `AGENTS.md`, the testing standards and the Jest workspace mapper;
- an image, a compose service and a SPIRE identity (`spiffe-helper-admin`, `svid-admin`), and K8s manifests (Deployment, HPA, PDB, NetworkPolicy, Ingress, ServiceAccount entry), all built, scanned and deployed on every release;
- an entry in the gateway mTLS ACL (`api-gateway ← admin-interface`) and a public ingress, which is attack surface for an application that could not do anything;
- the admin token passed to the bundle as `VITE_ADMIN_TOKEN`, so anyone who could load the page could read it.

The SPA's nginx had a second role, unrelated to the UI: it was the only external entry point to the gateway. The gateway accepts only SPIFFE mTLS clients (ADR-0011), and the nginx forwarded `/v1` to it with its own SVID. The ACL (`api-gateway ← admin-interface`), the E2E `gateway`, `security` and `smoke` suites (host port 8449) and the kind smoke test all used that path. It loaded its SVID once at startup, so after the first rotation (1 h TTL) it presented an expired certificate.

Fixing it meant rewriting the API layer *and* adding the missing backend endpoints first (jobs, cache, training control). That is product work. There is no user for it right now, and the backend is the priority.

## Decision

1. **Remove `admin-interface` from the repository**, without replacing the UI. The platform is operated through the api-gateway HTTP API (documented in [`api-gateway.yaml`](../services/openapi/api-gateway.yaml)), Grafana/Prometheus/Jaeger for observability, and `kubectl` / `docker compose` for operations.
2. **Keep the gateway entry point as a separate `edge-proxy`.** It is the official nginx image (pinned by digest) with one config, `deploy/edge-proxy/default.conf`, shared by compose (mounted file) and K8s (ConfigMap generated from it). It serves `/ping`, `/health/ready` and `/v1/*` → api-gateway, nothing else. It has its own SPIFFE identity `edge-proxy`, which replaces `admin-interface` in the gateway ACL and in `PLATFORM_SERVICES`. It runs non-root on a read-only filesystem and reads its SVID on each handshake (a variable in the certificate path), so rotation works. Compose publishes it on host port `EDGE_PORT` (8449). In K8s the public API Ingress (`api.` host, TLS at the controller) points at it, and the kind smoke test reaches it through `port-forward`.
3. **Remove everything that existed only for the UI:**
   - the workspace `services/admin-interface/` and its root scripts (`build:admin`, `dev:admin`, `test:admin`, `lint:admin`, its step in `build:ts`);
   - the image `ghcr.io/trading-model/admin-interface`: its Dockerfile, its build in `ci.yml` and `release.yml`, its tag in the overlays and `deploy.yml`, its canary and digest pinning, its Dependabot entry;
   - the public `admin-interface-ingress` (`admin.` host), the `VITE_*` variables and the `ADMIN_TOKEN` key of the K8s secrets (the gateway reads `AUTH_TOKENS`);
   - the `ServiceInstanceName.AdminInterface` enum member;
   - the gateway's own `POST /telemetry` route (web-vitals and ErrorBoundary reports), whose only producer was the SPA;
   - the frontend checks of the tooling: check 5 (frontend telemetry) of `observability-gate.mjs`, the consumer check of `api-contract.mjs` and its `adminInterface` known gaps, the TypeDoc entry in `generate-docs.mjs`, the `release.mjs` entry. The `admin-interface` commit scope stays allowed so that history and a later reintroduction keep a valid scope.
4. **The removal is temporary.** The code stays available in Git history (last version at commit `73e9f877`: `git show 73e9f877:services/admin-interface/README.md`) for reference, but **a new frontend is not a revert**. It comes back through a new ADR that supersedes this one, under these conditions:
   - every call it makes reaches a real route: its API client is generated from `docs/services/openapi/api-gateway.yaml` or checked by `bun run api:check` with **no** known gap;
   - the backend endpoints it needs exist first (each one is its own change, with its contract test);
   - no secret in the bundle: an operator signs in, and the SPA does not carry a shared token;
   - it is deployed, smoke-tested on kind (`tests/k8s/run-kind.sh`) and covered by the E2E stack like the other services.

## Consequences

### Positive

- The platform builds and releases 7 application images instead of 8. The public admin ingress is gone, and the gateway's only external client is a proxy with no application code.
- The external entry point survives SVID rotation, which the SPA's nginx did not.
- The public API Ingress goes through the gateway. It used to route `/v1/<prefix>` straight to the services, skipping auth and rate limiting, and needed a hand-minted client certificate (`trading-model-tls`). The gateway rate limit is now per API client, since every external request arrives from the proxy's address.
- One toolchain: every workspace is Jest + `ts-jest` + CommonJS/Node16, and the Vitest/Vite exceptions disappear from the conventions.
- `api:check` no longer carries 24 frozen consumer gaps: what remains in the known-gaps file is documentation only.

### Negative

- No graphical console. Registry, DLQ, audit and market data are read through the gateway API (`curl` with an API token) or directly in the databases, and training is only visible through its metrics and logs.
- Features that existed only in the SPA's mocks (jobs, cache administration, training start/stop) leave no trace in the running code. They are listed above for whoever specifies the next frontend.

### Neutral

- `edge-proxy` is a workload to deploy, scale (HPA 2–5) and register in SPIRE, like the SPA's nginx before it.
- The api-gateway keeps its public HTTP API (`AUTH_TOKENS` / `x-api-key`), which is what scripts and a later frontend use.
- Earlier ADRs that mention `admin-interface` (ADR-0007, ADR-0012, ADR-0016) are left unchanged: they describe the state at the time.
