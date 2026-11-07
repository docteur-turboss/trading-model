# ADR-0046: Simplification Trajectory for the Services, Broker, Discovery and DLQ

**Status:** Proposed
**Date:** 2026-11
**Related:** [ADR-0011](./0011-spiffe-spire-workload-identity.md), [ADR-0019](./0019-message-broker-as-built.md), [ADR-0023](./0023-discovery-registry-in-redis.md), [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md), [ADR-0042](./0042-singleton-collector-with-verified-recovery.md), [ADR-0043](./0043-message-delivery-once-per-subscribed-service.md) (delivery once per subscribed service; amends ADR-0019), [ADR-0044](./0044-singleton-trainer.md) (trainer singleton), [ADR-0045](./0045-single-service-resolution-strategy.md) (one resolution strategy; amends ADR-0023)

This ADR proposes a direction and decides nothing. The owner accepts, amends or refuses it (issue #504, audit architecture 2026-11-06, A5). Nothing here changes code or manifests.

## Context

The audit judges the system too complex for its scope: one flow, Binance → MySQL → bus → trainer. This ADR re-measures the figures on commit `00b5bc78` and sets out the options. Since then ADR-0043, ADR-0044 and ADR-0045 (all Accepted) were merged and issue #503 closed: the Decision below takes them into account. The measurements stay dated `00b5bc78`.

### Measurements (commit `00b5bc78`)

Commands, run from the repository root:

- Source lines, non-spec `.ts` per workspace: `git ls-files <ws>/src | grep '\.ts$' | grep -v '\.spec\.ts$' | xargs cat | wc -l` (file count: same without `xargs cat | wc -l`, using `wc -l` on the list).
- Compose services: `awk '/^services:/{f=1;next} /^[a-z]/{f=0} f&&/^  [a-zA-Z0-9_-]+:/{c++} END{print c}' docker-compose.yml`
- ADRs: `ls docs/adr | grep -c '^[0-9]'`
- Ops scripts: `git ls-files scripts deploy | grep -E '\.(sh|mjs|cjs)$' | xargs cat | wc -l`
- Docs: `git ls-files docs | grep -c '\.md$'`

| Workspace | src files | src lines | Role |
| --- | --- | --- | --- |
| trader-trainer | 201 | 12 865 | training (the product) |
| financial-scraper | 62 | 4 633 | ingestion (the product) |
| dlq-service | 73 | 4 237 | dead letters, MongoDB + Redis |
| message-manager | 38 | 2 197 | custom broker |
| discovery-server | 39 | 2 127 | service registry, Redis |
| audit-logger | 30 | 2 062 | hash-chained audit trail |
| api-gateway | 16 | 1 186 | public API |
| address-manager (package) | 62 | 3 895 | service resolution client |
| other packages (10, incl. broker-message) | 239 | 10 320 | shared libraries |
| **All** | **760** | **43 523** | |

Other figures: 29 compose services, 12 328 lines of `.sh/.mjs/.cjs` in `scripts/` and `deploy/` (10 693 in `scripts/` alone), 40 ADRs at `00b5bc78` (44 on the current base, this one included), 144 Markdown files under `docs/`.

Differences from the audit: 43 523 source lines instead of 44 271 (dlq-service 4 237 instead of 4 310, discovery-server 2 127 instead of 2 166, address-manager 3 895 instead of 3 957: the audit likely counted blank or generated lines differently); 29 compose services instead of about 50; 12 328 ops lines instead of 17 884 (the audit probably included other trees: not reproducible with the command above). The direction of the finding holds; the compose figure is overstated by the audit.

### What the pieces return

| Component | Cost | Value |
| --- | --- | --- |
| message-manager + dlq-service + broker-message | 6 434 service lines plus a package; MongoDB, Redis; a synchronous publish that holds the request up to 300 s (issue #502) | decouples scraper and trainer; replaceable by a standard broker with native dead-lettering |
| discovery-server + address-manager | 6 022 lines; one resolution strategy since ADR-0045 (issue #503, closed): the registry only says who is alive and which major version, the platform DNS gives the address | liveness and major version; the address part is already done by Kubernetes DNS and compose DNS |
| Redis shared by six services | one shared failure and data domain (issue #506) | caches, registry, DLQ rate limits |
| SPIRE | 3+ containers per stack, ADR-0011, sidecar per service | mutual identity; kept: not in scope here |
| ops scripts and gates | 12 328 lines, 11 gate commands | backups, PITR, restore drills: tied to real data-loss findings, not simplification targets |

## Options

| Option | Cost | Risk | Gain |
| --- | --- | --- | --- |
| A. Status quo | none | complexity and bus factor keep growing with each ADR and gate | no migration risk |
| B. Modular monolith + workers: one API process, one ingestion worker, one training worker, standard broker or none between them | large: weeks, touches every service, ADR-0019/0023/0029 superseded, contract tests rewritten | high: big-bang risk on a system with data-loss history | removes discovery, DLQ service, most compose entries and service-to-service mTLS surface; about 6 000 to 10 000 lines fewer |
| C. Partial retirement, one step at a time, each reversible | small steps, each its own issue and ADR | low: each step ships and is checked alone | most of the gain of B for the broker/discovery/DLQ trio, no big bang |

## Decision (proposed)

Option C, in this order. The owner decides each step; an agent can only prepare the ADR and the migration for a step the owner has accepted.

1. **Durable asynchronous publish** (issue #502, A3, still open). Prerequisite for step 4: the broker must accept and persist before it delivers. ADR-0043 does not change this: it only fixes who receives a delivery (once per subscribed service) and states that the HTTP broker without message persistence stands, so the synchronous publish of #502 is untouched. Agent-doable.
2. **Retire discovery-server?** The single strategy is done (issue #503 closed, ADR-0045 Accepted: "registry says alive, platform says where"; its decision 6 leaves removal to a later ADR). One question remains: does the registry's liveness and major-version role still earn discovery-server's 2 127 lines plus its Redis registry, given that readiness already removes dead pods from Kubernetes Services? Retiring it is an owner decision and a new ADR (it would supersede the remaining parts of ADR-0023).
3. **Isolate Redis per service** (issue #506, A7). Cuts the shared failure domain and shows which Redis uses can go away.
4. **Standard broker with native dead-lettering**, replacing message-manager and dlq-service. Out of reach of an agent: it needs the owner to choose the broker (the Redis Streams choice of audit 13.09 was dropped, see ADR-0019) and to accept the operational cost of running it.
5. **Modular monolith + workers** (option B) is re-evaluated only after steps 1 to 4, on measured numbers.

Out of reach of an agent: choice of broker, acceptance of retiring discovery-server, any step that changes the deployed topology of production.

## Consequences

- Each step needs its own issue; this ADR is the map.
- Until accepted, the existing ADRs stay as they are.
- Step 2 would supersede the remaining parts of ADR-0023 and ADR-0045; step 4 would supersede ADR-0019 together with its amendment ADR-0043. Both need a later ADR.
- ADR-0044 fixes the trainer at one pod: the "training worker" of option B already is a single process, so B gains nothing more there.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Rewrite as a monolith now | Big-bang risk; the audit asks for a decided path, not a rewrite in this issue |
| Remove SPIRE | Out of scope; identity is a separate decision (ADR-0011) |
| Do nothing | Cost of every cross-cutting change stays high |
