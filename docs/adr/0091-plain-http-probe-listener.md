# ADR-0091: Plain-HTTP Probe Listener Beside the mTLS Port

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0011](./0011-spiffe-spire-workload-identity.md) (mTLS everywhere: this ADR is a scoped exception), [ADR-0056](./0056-infrastructure-metrics-exporters.md) (container metrics)
**Verified by:** `packages/http/tests/server/service-server-factory.spec.ts`, `packages/http/tests/server/configure-app.spec.ts`, `tests/k8s/run-kind.sh`

## Context

The service port 3000 rejects any client without an SVID at the TLS handshake (ADR-0011), and a kubelet `httpGet` probe presents none. The three probes of every Node service therefore ran `node /app/probe.js` through `exec`: measured on staging kind (issue #2712), 75 to 91 ms of CPU and about 59 MB RSS per run, about 14m of CPU per pod at rest (14 % of the 100m request the HPA targets) and a transient 59 MB inside a 256 Mi limit.

## Decision

Option 1 of issue #2712, chosen by the owner on 2026-11-26:

- `createServiceServer` (`@trading-model/http`) also starts a plain-HTTP listener on port 3001 (`HEALTH_PORT`) whose app (`createHealthApp`) mounts only `GET /ping` and `GET /health/ready`. Both return a status and per-check `ok`/`error`, no business data. Every other path answers 404.
- The liveness, readiness and startup probes of the services in `deploy/k8s/services/` are `httpGet` on 3001. No process starts per probe.
- No NetworkPolicy opens 3001: the namespace default-deny keeps pods out, the kubelet probes from the node as it already does for the spiffe-helper sidecar (8081). An ingress rule must keep listing its ports.
- Port 3000 is unchanged: TLSv1.3, client certificate required at the handshake.

## Consequences

- Probes cost an HTTP request handled by the running process instead of a new Node process.
- Exception to ADR-0011: two read-only routes in clear text, reachable from the node (and, in compose, from containers on the same network). `/health/ready` tells the reader which dependency check fails.
- Compose healthchecks and `deploy-k8s.sh` still use `/app/probe.js` on 3000; they could move to 3001 later.
