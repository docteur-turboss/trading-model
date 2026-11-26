# ADR-0046: Simplification Trajectory for the Services, Broker, Discovery and DLQ

**Status:** Accepted
**Date:** 2026-11 (accepted 2026-11-15, issue #1202)
**Verified by:** manual review 2026-11-15: owner decision on issue #1202; steps 1 and 3 shipped as ADR-0048 (deleted, superseded by ADR-0073) and `docs/adr/0047-redis-isolation-per-service.md`; step 4 shipped as `docs/adr/0073-message-bus-as-a-redis-streams-library.md` (release N+1, issue #1241)
**Related:** [ADR-0011](./0011-spiffe-spire-workload-identity.md), ADR-0019 (deleted), ADR-0023 (deleted), [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md), ADR-0042 (deleted), ADR-0043 (deleted) (delivery once per subscribed service; amends ADR-0019), [ADR-0044](./0044-singleton-trainer.md) (trainer singleton), ADR-0045 (deleted) (one resolution strategy; amends ADR-0023)

This ADR sets the direction (issue #504, audit architecture 2026-11-06, A5). The owner accepted it on 2026-11-15 (issue #1202, audit architecture 2026-11-15, A1/A2): step 2 is accepted and step 4 is Redis Streams used as a library. Nothing here changes code or manifests: each step ships through its own issue and ADR.

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

## Decision

Option C, in this order. The owner decides each step; an agent can only prepare the ADR and the migration for a step the owner has accepted.

Owner decisions of 2026-11-15 (issue #1202): retire discovery-server (step 2), and Redis Streams as a library for step 4. Steps 1 and 3 had shipped (ADR-0048, ADR-0047).

1. **Durable asynchronous publish** (issue #502, A3, still open). Prerequisite for step 4: the broker must accept and persist before it delivers. ADR-0043 does not change this: it only fixes who receives a delivery (once per subscribed service) and states that the HTTP broker without message persistence stands, so the synchronous publish of #502 is untouched. Agent-doable.
2. **Retire discovery-server?** The single strategy is done (issue #503 closed, ADR-0045 Accepted: "registry says alive, platform says where"; its decision 7 leaves removal to a later ADR). One question remains: does the registry's liveness and major-version role still earn discovery-server's 2 127 lines plus its Redis registry, given that readiness already removes dead pods from Kubernetes Services? Retiring it is an owner decision and a new ADR (it would supersede the remaining parts of ADR-0023).
   **Accepted (2026-11-15).** The gateway and the clients resolve a service by its DNS name (Kubernetes Service or compose name) and no longer ask a registry; liveness is pod readiness. discovery-server, the register/heartbeat/token calls of `packages/address-manager`, the Redis keyspace `trading-model:discovery:*` and the ACL user `discovery` go, in two releases (ADR-0040 expand/contract). Issue #1208 does the work; its ADR supersedes ADR-0023 and the remaining parts of ADR-0045 and ADR-0071, and states where the major API version lives.
3. **Isolate Redis per service** (issue #506, A7). Cuts the shared failure domain and shows which Redis uses can go away.
4. **Standard broker with native dead-lettering**, replacing message-manager and dlq-service. Out of reach of an agent: it needs the owner to choose the broker (the Redis Streams choice of audit 13.09 was dropped, see ADR-0019) and to accept the operational cost of running it.
   **Decided (2026-11-15): Redis Streams as a library.** Producers and consumers read and write the topic streams of ADR-0048 directly through a shared package, with no `message-manager` service in between; no new infrastructure. Options not taken: NATS JetStream and RabbitMQ with DLX (a new stateful component to run and back up), status quo (message-manager and dlq-service stay). Accepted cost: Redis stays a failure domain shared by the journal and the other Redis uses. Left to the step-4 ADR: whether the journal gets its own Redis with a dedicated `maxmemory-policy noeviction` (no `maxmemory` is set today in `deploy/` nor `docker-compose*.yml`), how dead letters are kept (delivery count of the consumer group, then a dead stream or dlq-service), and what remains of dlq-service (issue #1211 applies meanwhile). That ADR supersedes ADR-0019, ADR-0043 and ADR-0048.
5. **Modular monolith + workers** (option B) is re-evaluated only after steps 1 to 4, on measured numbers.

Out of reach of an agent: any step that changes the deployed topology of production without an owner-accepted issue. The choice of broker and the retirement of discovery-server were decided on 2026-11-15 (issue #1202).

## Consequences

- Each step needs its own issue; this ADR is the map.
- Until the ADR of a step is accepted, the existing ADRs stay as they are.
- Step 2 supersedes the remaining parts of ADR-0023, ADR-0045 and ADR-0071 (issue #1208); step 4 supersedes ADR-0019, its amendment ADR-0043 and ADR-0048. Both need a later ADR.
- ADR-0044 fixes the trainer at one pod: the "training worker" of option B already is a single process, so B gains nothing more there.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Rewrite as a monolith now | Big-bang risk; the audit asks for a decided path, not a rewrite in this issue |
| Remove SPIRE | Out of scope; identity is a separate decision (ADR-0011) |
| Do nothing | Cost of every cross-cutting change stays high |
| NATS JetStream for step 4 | Native dead-lettering, but a new StatefulSet to run, monitor and back up (owner, issue #1202) |
| RabbitMQ with DLX for step 4 | Mature native dead-lettering, but heavier to run than NATS (owner, issue #1202) |
| Keep discovery-server | Duplicates Kubernetes readiness and caused the 404s of issues #1112 and #1156 (owner, issue #1202) |
