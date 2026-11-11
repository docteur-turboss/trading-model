# ADR-0059: Scoped API Keys, and the Key Name as Actor of DLQ Audit Events

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) (the audit chain these events go into), [ADR-0048](./0048-durable-message-journal-in-redis-streams.md) (message-manager answers 202 once the message is journaled), [ADR-0016](./0016-shared-contracts-ownership.md) (`dlq-events.ts` and `http-headers.ts` in `@trading-model/contracts`), [ADR-0011](./0011-spiffe-spire-workload-identity.md) (caller identity from the SVID), [ADR-0017](./0017-no-swallowed-errors.md), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand/contract over one release)
**Verified by:** `services/api-gateway/tests/unit/api-keys.spec.ts`, `services/api-gateway/tests/unit/auth.spec.ts`, `services/api-gateway/tests/unit/router.spec.ts`, `services/api-gateway/tests/unit/proxy-header-sanitizer.spec.ts`, `services/api-gateway/tests/integration/routes.integration.spec.ts`, `services/dlq-service/tests/unit/actor.spec.ts`, `services/dlq-service/tests/unit/audit.spec.ts`, `services/dlq-service/tests/integration/routes.integration.spec.ts`, `tests/contract/service-contracts.spec.ts`, `tests/alerts/alerting.test.yml`

## Context

The compliance audit of 2026-11-09 (finding C2, issue #729) found that every key of the gateway's `AUTH_TOKENS` could do everything: a key used to read market data could also delete DLQ entries (`DELETE /dlq-service/dlq`) or replay them into the training chain (`POST /dlq-service/dlq/replay`). The identity computed for the key only fed the rate limiter. The events `dlq.entries.deleted` and `dlq.replay.completed` did not say who acted, and their publish was not awaited: when message-manager refused one, the action was done and the audit trail silently lost it (a `warn` log). No least privilege and no accountability for destructive human actions (RD 2017/565 art. 72).

The owner chose, in the issue: the 502 on a refused audit event (option A1) and every scope for the old key format during the transition release (option B1).

## Decision

1. **Named keys with scopes.** An entry of `AUTH_TOKENS` is `name:scope1+scope2:secret`. The secret is what follows the last `:` (the scope `dlq:write` holds one), so it must not contain `:`; the name matches `[A-Za-z0-9._-]{1,64}`. Scopes: `read` (every `GET` route of `PUBLIC_ROUTES`) and `dlq:write` (`DELETE /dlq-service/dlq`, `POST /dlq-service/dlq/replay`). The scope a route needs comes from its method (`requiredScope`, `services/api-gateway/src/shared/api-keys.ts`): no second table. Every non-`GET` public route is a DLQ write; `api-keys.spec.ts` fails if another one is added. A key without the scope gets **403** before the route is resolved. A malformed entry stops the gateway at startup (the error names the key, never the secret).
2. **Old format, one release (expand/contract).** An entry without `:` is the old bare secret. It is accepted with **every scope** (`read+dlq:write`), under the name `legacy-<first 8 hex of its sha256>`, and the gateway logs a warning naming it. An existing deployment keeps exactly its access, and its actions are already attributed to one key. The next release removes this branch: rewrite the keys before it (`scripts/rotate-secrets.sh` writes the new format).
3. **Actor header.** The gateway drops any `x-actor` the client sends and sets `x-actor: <key name>` on what it proxies; never the secret nor its digest. No header when no key matched (non-strict dev mode with an empty `AUTH_TOKENS`).
4. **Trusted from api-gateway only.** dlq-service reads `x-actor` only when the mTLS caller (SVID, `req.clientIdentity`) is `api-gateway` (`actorOf`, `services/dlq-service/src/adapters/inbound/actor.ts`); from any other caller the actor is `null`. The SVID cannot be forged by a client: only the gateway's own identity can carry an actor.
5. **`actor` in the three events.** `dlq.entry.added`, `dlq.replay.completed` and `dlq.entries.deleted` carry `actor: string | null` (`packages/contracts/src/dlq-events.ts`): the key name, or `null` for internal callers (message-manager's dead letters, the auto-retry). audit-logger stores the payload as is: no validator changes.
6. **No silent success for human actions (A1).** A `DELETE /dlq` or a manual replay is done first, then waits for message-manager to accept its event (202 on the journal, ADR-0048). If it does not: the API answers **502** with the usual body plus `auditRecorded: false` (the deletion or replay did happen); dlq-service logs an `error` with the payload (ids, actor) and increments `dlq_audit_publish_failures_total{event}`. The alert `DlqAuditEventLost` (critical) fires on any increase for those two events ([runbook](../operations/runbooks/runbook-dlq-backlog.md#dlqauditeventlost)). `dlq.entry.added` and the auto-retry replays keep a publish that is not awaited (a dead letter must not wait for the bus), but they are logged and counted the same way.

7. **Amendment (issue #845): no public deposit.** `POST /dlq-service/dlq` is removed from `PUBLIC_ROUTES`. With `dlq:write` a client could store any `message` for any `service`, then replay it to that service (forged candles to `trader-service`). Dead letters come from message-manager (direct mTLS call); an operator who fixes a rejected entry deposits it from inside the stack with the dlq-service SVID (runbook-message-bus-outage), and replay stays available through the gateway. Alternative not chosen: record the caller's SPIFFE identity per entry and replay only message-manager's (more code, schema change; the route removal is enough).

## Alternatives considered

- **Refuse before acting (A2):** an intent event (`dlq.entries.delete-requested`) accepted before the action. No action without a trace, but two more topics, and the DLQ could not be cleaned during a bus outage. Not chosen.
- **Outbox in MongoDB (A3):** action and event in one transaction, a relay with its lease. No loss and no refusal, but 2 to 3 days of code and an unbounded delay during an outage. Possible later if `DlqAuditEventLost` fires for real.
- **One shared key with its digest logged:** attributable, but no least privilege.
- **`read` only for old keys (B2):** least privilege at once, but every operator purging or replaying the DLQ with an old key would get 403 on the upgrade.

## Consequences

- A read-only key (`grafana:read:…`) can no longer touch the DLQ. Who deleted or replayed what is in the audit chain, by key name.
- A delete or replay answered 502 is done but not in the chain: the error log and the alert are its only record; the runbook asks to note it in the incident report (the chain cannot be patched afterwards, ADR-0027).
- Key names reach dlq-service and the audit trail: they must not hold personal data beyond an operator handle.
- Old-format keys keep every scope for one release; the gateway logs a warning naming them at the first authenticated request after each start.
