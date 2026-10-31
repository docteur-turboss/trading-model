# Error Handling Standards

## Why

The audit of 2026-09-13 traced several broken subsystems that raised no alert and no crash to one habit: errors caught and dropped. A subscription that failed, a Redis queue that refused every push, and a circuit state that never loaded all looked like success. A system that fails silently cannot be operated, so every caught error must leave a trace or reach a caller that decides. See [ADR-0017](../adr/0017-no-swallowed-errors.md).

## Rules

A `catch` block, a `.catch(handler)` or a `.then(_, handler)` must do at least one of:

1. **Propagate**: rethrow, possibly wrapped with `cause` (`throw messageManagerError("…", { cause: normalizeError(err) })`).
2. **Report**: log it (`logger.warn`/`logger.error`) or record a metric, with enough context to find the failing resource.
3. **Delegate**: hand it to a handler whose job is error handling (`this._handleDeliveryError(err, …)`).

### Do not turn an infrastructure failure into a domain value

An adapter must not answer `[]`, `0`, `null` or `false` for "the dependency is down" when the same value means a normal result. "Redis is unreachable" is not "the queue is empty", and "the registry did not answer" is not "no instance is registered".

- Prefer propagating, so the caller decides.
- If the port's contract is "never throws" (fire-and-forget queues, best-effort shutdown), the adapter **logs** before returning the fallback, and callers **check the result** rather than reporting success unconditionally (`Re-queued 1/2 entries`, not `Re-queued 2 entries`).
- A typed `Result` (`{ ok: false, error }`) is fine: the error travels with the value.

### Best-effort is explicit

Some failures really must not stop the flow, such as shutdown cleanup, telemetry or closing a connection that is already broken. They are still logged (usually `warn`), and a comment explains why execution continues.

### Fire-and-forget

`void promise()` disables `noFloatingPromises`. Use it only when the callee never rejects (it catches and logs internally) or a process-level handler is the intended reporter. Do not put `.catch(() => {})` on it.

## Legitimate conversions

A few `catch` blocks convert an exception into a value **by design**. Each must carry a suppression that states why:

```ts
// biome-ignore lint/plugin: readiness probe: failure is the negative signal
try {
	await client.ping();
	return true;
} catch {
	return false;
}
```

Accepted reasons: readiness/health probes, validation predicates (`isValidX`), parse helpers whose `null` means "not that format", fallback loops that rethrow the last error, `Result` adapters.

## Enforcement

| Mechanism | Catches |
| --- | --- |
| `suspicious/noEmptyBlockStatements` (`biome.json`, `src` only) | `catch {}`, `.catch(() => {})`, any empty function body. Intentional no-op stubs carry a `// Intentional no-op.` comment |
| `biome-plugins/no-swallowed-errors.grit` (`**/src/**`) | Any `catch`/`.catch`/`.then(_, h)` handler that neither throws nor calls anything: `return null`, `() => undefined`, an assignment… |
| Code review ([PR Standards](./pr-standards.md#review)) | What a linter cannot judge: a handler that calls something unrelated, a misleading success log, a fallback value that hides an outage |

The plugin is a heuristic. A handler that calls *any* function passes, so the review criterion is not optional.

Tests are excluded from both rules: they deliberately silence errors when tearing down fixtures.
