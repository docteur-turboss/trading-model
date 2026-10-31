# ADR-0017: No Swallowed Errors — Lint Rule, GritQL Plugin and Review Criterion

**Status:** Accepted
**Date:** 2026-10
**Related:** [Error Handling Standards](../standards/error-handling.md)
**Verified by:** `bun run lint` (runs the GritQL plugin biome-plugins/no-swallowed-errors.grit)

## Context

The audit of 2026-09-13 reported "a systematic error-swallowing pattern across all layers": each functional, quality or performance audit had logged its own occurrence as a local anomaly, but together they showed an implementation habit. Re-verified on 2026-10-26 with an AST census of every `catch` in non-test sources (~127 sites): 8 empty handlers and ~48 handlers that returned a fallback value without logging or rethrowing. Some fallbacks are legitimate (readiness probes, validators). The ones that hid real failures:

- `broker-message` `TopicSubscriptionService` wrapped every HTTP failure as `MessageManagerError`, then swallowed exactly that error (`return undefined as never`). A failed subscription looked like success, and audit-logger logged "Subscribed to all event topics".
- `dlq-service` `DlqRedisQueue.push/pop` turned any Redis error into `false`/`null` without a log. The re-queue paths ignored that `false` (`.catch(() => {})` on a promise that never rejects) and logged the full count anyway.
- `address-manager` `DiscoveryRetryHandler` fired `loadFromStore()` without awaiting it (`.catch(() => {})`), then read `isOpen()`. The shared circuit state almost never arrived in time, and a store failure left no trace.
- `trader-trainer` `StateManager.initialiseFromGenome` replaced a mismatched genome with random weights. The method is currently unused (the GA calls `setWeights`, which throws), but it was a trap for the next caller.
- Smaller cases: `findAllServices` returned `[]` on a registry outage, the cache `getVersion` returned `0` on a Redis error, the rate-limiter Redis client silently disabled itself, and the log writer raced `mkdir` against `appendFile`.

Of the four examples in the audit, only the subscription case was still present as described. `MongoBatchWriter` does not exist in the repository or its history, and the WebSocket manager has no error listener at all, which means a crash rather than a swallowed error. The finding holds on the census, not on its original examples.

`biome.json` already had `noFloatingPromises`, but `.catch(() => {})` and `void` both satisfy it. Biome's `noEmptyBlockStatements` was not enabled, and on its own it only sees literally empty blocks: it misses `() => undefined`, `catch { return null; }` and comment-only handlers, which covers every serious case above.

## Decision

1. **Enable `suspicious/noEmptyBlockStatements`** in `biome.json` (off under `**/tests/**`). Intentional no-op stubs (null objects, noop loggers/metrics) carry an `// Intentional no-op.` comment.
2. **Add the GritQL plugin `biome-plugins/no-swallowed-errors.grit`** (scoped to `**/src/**`). It reports any `try/catch` body, `.catch(handler)` or `.then(_, handler)` arrow/function handler that contains neither a `throw` nor a call. Legitimate conversions are suppressed in place with `// biome-ignore lint/plugin: <reason>`, so each exception is reviewed and greppable.
3. **Make it a design rule and a review criterion**: [Error Handling Standards](../standards/error-handling.md) forbids turning an infrastructure failure into a domain value indistinguishable from a normal result, and requires best-effort paths to log. [PR Standards](../standards/pr-standards.md#review) and the PR template list it explicitly.
4. **Fix the existing occurrences** listed in the context, in the same change:
   - subscription failures propagate (the service fails to start); unsubscription stays best-effort on shutdown but logs;
   - Redis queue errors are logged, and re-queue callers count the pushes actually accepted;
   - circuit state is awaited before `isOpen()`, and a store outage is logged and falls back to local state;
   - a mismatched genome throws;
   - `findAllServices` throws `ServiceUnreachableError`, and cache/version/rate-limiter/disconnect/unregister failures are logged.

## Consequences

### Positive

- An empty or value-only handler can no longer be merged into `src` without a written justification.
- The fixed paths now surface their failures: startup fails on a broken subscription, and logs distinguish "queue down" from "queue empty".

### Negative

- The plugin is syntactic: a handler that calls *anything* passes. Review remains necessary.
- 17 `biome-ignore lint/plugin` suppressions document the legitimate conversions; new ones must justify themselves in review.
- `findAllServices` and `TopicSubscriptionService.subscribe` now reject where they used to resolve. No production caller of `findAllServices` exists; `subscribe` callers run in `onStart`, where a rejection aborts startup as intended.

### Out of scope

- `void promise()` fire-and-forget sites (~20) remain allowed by `noVoid: "off"` and were not audited one by one here. An unhandled rejection reaches the process-level handler in `server-utils/signal-handler`, so it is loud, not silent.
- `WorkerWsManager` registers no `error` listener on sockets and drops `sendToWorker` messages silently when a socket is not open. Both need a protocol decision, not a lint rule, and are left for a follow-up.
