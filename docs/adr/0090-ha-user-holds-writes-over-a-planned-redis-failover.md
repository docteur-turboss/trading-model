# ADR-0090: The Redis `ha` User Holds Writes Over a Planned Failover

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0047](./0047-redis-isolation-per-service.md) (ACL users), [ADR-0073](./0073-message-bus-as-a-redis-streams-library.md) (bus journal), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand/contract)
**Verified by:** `packages/persistence/tests/db/k8s-redis-ha.db.spec.ts`, `tests/k8s/deploy-release.test.sh`

## Context

In staging-local, `redis-0` is held by `partition: 1` and keeps the template of an older release, so the ACL users it lacks (risk-execution, decision-consumer in v3.2.x) never appear. `deploy-release.sh redis-last` replaces it without stopping the master: `redis-1` joins on the new template, `SENTINEL FAILOVER` promotes it, `redis-0` is updated as its replica and takes the master role back (issue #2882). With `JOURNAL_MIN_REPLICAS=0` (one node), a bus entry the old master accepts between the promotion and the moment its clients follow `+switch-master` is lost when it resyncs, while the publisher got `OK` (risk-execution drops it from its outbox). The `ha` user had neither `CLIENT PAUSE` nor `FAILOVER` to close that window.

## Decision

Option 2 of issue #2882, chosen by the owner on 2026-11-25:

- `ha` gains `+client|pause` and `+client|unpause` (`redis-ha.sh`). The release only adds them (expand).
- Once the replica is linked and listed by the sentinel (it can be promoted), `deploy-release.sh` puts the old master in `CLIENT PAUSE 30000 WRITE`, waits until the replica has its `master_repl_offset`, then fails over. Once the sentinel names the new master, it sends `REPLICAOF` to the old one, then `CLIENT UNPAUSE`: held writes get `READONLY` (or are re-sent after the client reconnects) and are published again on the new master. A failover that times out ends with `CLIENT UNPAUSE` (see Consequences); the pause expires by itself if the run dies.
- An old master whose `ha` user predates this ADR answers `NOPERM`: that failover runs unpaused and keeps the window once. Accepted for the upgrade from v3.1.0 only. Any other answer to the pause is retried at the next pass, never failed over unpaused.

## Consequences

- No accepted entry is lost over a planned failover, from the release after the one that adds the ACL.
- `ha` can freeze writes for 30 s at most. It already holds `SLAVEOF`, which is as disruptive; it still reaches no key.
- Writes pause at each failover from the pause to the `CLIENT UNPAUSE` after the sentinel names the new master: a Sentinel promotion plus a few polling passes of `deploy-release.sh` (1 s and some `kubectl exec` each), not measured on kind. A failover the sentinel has not done 30 passes (at least 30 s) after the first pause ends with `CLIENT UNPAUSE` and fails the step. Consumers' `XREADGROUP` (a write command) is held too and retried.
- Production (3 replicas, no partition) never runs this swap.
