# ADR-0060: N-1 Compatibility of the Public API and the Bus Messages

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand/contract for SQL), [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) (OpenAPI generated from Zod)
**Verified by:** `bun run contracts:check` (snapshot up to date and comparator tests), `scripts/schema-compat.test.mjs`, manual review 2026-11-09 (ci.yml job contract: oasdiff and contracts:compat against the last release tag)

## Context

During a rolling deployment releases N-1 and N run together (ADR-0040 states it for the schema). Nothing compared the public OpenAPI or the bus message schemas with the previous release: a required field added to an event, or a field removed from a public response, broke the instances of the other version (audit strategie-tests 2026-11-08, A17, issue #654).

## Decision

1. **Rule.** What release N publishes must stay usable by N-1 and the reverse, so a change is *expand only*: add optional fields, add enum values, add routes. Forbidden in the same release: remove or rename a field, make an optional field required, change a type, remove an enum value, remove an event or a route. A forbidden change is split in two releases (expand in N, contract in N+1 once N-1 is no longer a rollback target).
2. **Public API.** CI runs `oasdiff breaking` (pinned version and sha256) of `docs/services/openapi/api-gateway.yaml` against the file at the last stable `vX.Y.Z` tag, with `--fail-on ERR`.
3. **Bus messages.** `docs/services/events/schemas.json` holds one JSON Schema per event, generated from `EVENT_VALIDATORS` (`bun run contracts:write`); `contracts:check` fails when it is stale, `contracts:compat` compares it with the snapshot of the last stable tag (`scripts/schema-compat.mjs`).
4. **No tag or no snapshot at the tag**: nothing to compare, success with a message (first run, fork, first release carrying the snapshot).
5. **Intentional break.** Declared in the PR, never bypassed: messages, add `{"break": "<exact line printed by the check>", "reason": "..."}` to `docs/services/events/breaking-exceptions.json`; OpenAPI, add the oasdiff line to `docs/services/openapi/oasdiff-ignore.txt` (`--err-ignore` format). The entries are reviewed in the PR and removed in the next release.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| PR label to skip the check | Invisible in the diff and not versioned; a file is reviewed with the change |
| Versioned topics (`v2`) | Out of scope of this decision |
| Runtime compatibility test between two images | Costly; the kind N-1 to N job already covers part of it |

## Consequences

The snapshot is regenerated with every message schema change. The comparator is structural (properties, required, type, enum, items, union branches by index): a reordered union reports a false break, to be declared as an exception.
