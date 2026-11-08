# ADR-0027: Audit Trail Verified by audit-logger and Anchored Outside MongoDB

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0050](./0050-audit-chain-single-writer-lease.md) (writers take a lease on the chain head)
**Verified by:** `services/audit-logger/tests/unit/domain/audit-chain.spec.ts`, `services/audit-logger/tests/unit/domain/audit-chain-script.spec.ts`, `services/audit-logger/tests/unit/audit-chain/chain-audit.spec.ts`, `services/audit-logger/tests/unit/adapters/s3-anchor-store.spec.ts`, `services/audit-logger/tests/unit/config/chain-audit-container.spec.ts`, `tests/alerts/run.sh`, `tests/k8s/run-kind.sh`

## Context

audit-logger chains every audit event: `dataHash` is the sha256 of the event and of `previousHash`, `chainSequence` is unique (`audit-repository.ts`). The chain is the platform's tamper evidence for the audit trail kept for MiFID II (`AUDIT_RETENTION_DAYS`, default 1827 days). Checked on 2026-10-31:

- **Nothing verified the chain.** It was written, never read back. The first verifier (`tests/backup/audit-chain.js`, used by the restore drills) found that every event without a correlationId failed: the hash skipped the undefined field, the driver stored it as `null`. Fixed on 2026-10-31 (`ignoreUndefined`); older events verify because the verifiers drop that `null`, which the builder never hashes.
- **Verification only ran in the restore drills.** In production a broken chain (lost write, manual edit, bad restore) went unnoticed until someone ran the mongosh script by hand.
- **A chain alone does not prove the trail was not rewritten.** Anyone able to write to the audit database can change an event and recompute every later hash: the chain is then valid again. Detection needs a value the writer cannot change afterwards, kept outside MongoDB.
- **Old events expire** (TTL index on `ttl`): a full verification starts from the oldest event left, and the chain has no fixed origin.

## Decision

1. **audit-logger owns the verifier** (`ChainVerifier`, `src/domain/audit-chain.ts`): sequence contiguous, `previousHash` = previous `dataHash`, `dataHash` recomputed from the stored content, anchors matched. `tests/backup/audit-chain.js` stays as the offline tool of auditors and drills, without anchors; `audit-chain-script.spec.ts` feeds both the same events.
2. **Incremental verification every 15 minutes** (`AUDIT_CHAIN_INTERVAL_MS`, `ChainAuditScheduler`), on every replica (read-only checks, idempotent anchors). Each cycle resumes from the last verified point (`audit_chain_state`), then anchors the verified head: an anchor always vouches for a chain that held. Metrics `audit_chain_broken`, `audit_chain_verified_sequence`, `audit_chain_last_verification_timestamp`, `audit_chain_anchored_sequence`, `audit_chain_last_anchor_timestamp`, `audit_chain_anchoring_enabled`; alerts `AuditChainBroken` (critical, at once), `AuditChainVerificationStale` and `AuditChainAnchoringStale` (critical, 45 min + 15), `AuditChainNotAnchored` (warning).
3. **Anchors in an S3 bucket with Object Lock, compliance mode** (`S3AnchorStore`). One object per anchor, `audit-chain/anchors/<sequence>-<hash>.json`, retained `AUDIT_RETENTION_DAYS`: neither its writer nor the account owner can delete or overwrite it. The anchor date is the object's LastModified, set by S3. A dedicated bucket with its own credentials (put, list, get only), not the backup bucket. The verifier fails on an anchor that does not match its event, on an anchor beyond the last event (events removed), and on an anchor too recent to have expired whose event is gone (events removed before their retention ended).
4. **Losses are acknowledged, never erased.** After a restore from an older backup, the anchors written after the backup no longer match: the operator records the loss (`chain-cli.js acknowledge-loss`), an object in the same locked bucket. Anchors written before it, for the sequences it covers, stop applying; the acknowledgement stays in every report.
5. **Auditors get an exported report, not a route.** `chain-cli.js report` (inside an audit-logger pod) prints a full verification, the anchors and the acknowledged losses as JSON; exit code 1 when the chain is broken. No route is added to `PUBLIC_ROUTES`.
6. **Production requires anchors.** The production overlay sets `AUDIT_ANCHOR_REQUIRED=true`: audit-logger refuses to start without `AUDIT_ANCHOR_BUCKET`, and `deploy.yml` stops before any change when the GitHub environment has no anchor bucket. Elsewhere the chain is verified only and `AuditChainNotAnchored` says so.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Keep the mongosh script as the only verifier | Runs only when someone thinks of it; no alert on a broken chain |
| Verify the whole chain on every run | Cost grows with five years of events; the checkpoint makes each run proportional to the new events |
| Chain without external anchors | Detects accidental damage, not a deliberate rewrite by someone with database access |
| RFC 3161 timestamping authority | Independent third-party proof, but an external dependency on the write path; can be added later on top of the bucket |
| Anchors in the encrypted backups only | Whoever controls the backups controls the proof |
| Anchor every event | Every audit write would depend on S3: an outage would block the audit trail |
| Verification route through the gateway | Larger exposed surface and one more API key for an occasional need; the exported report covers it |
| MongoDB-side immutability (no update/delete role for audit-logger) | Worth adding, but the database administrator and a restore can still rewrite; does not replace anchors |

## Consequences

### Positive

- A broken, truncated or rewritten trail raises an alert within one cycle instead of waiting for an audit.
- The integrity claim made for MiFID II rests on values outside the database, dated by the storage provider.
- A restore leaves an explicit, immutable trace of what it lost.

### Negative

- A new external dependency (anchor bucket) with its own credentials, retention and cost (about 96 objects a day).
- A rewrite of events younger than the last anchor (up to 15 minutes) is only caught if it happens after the next anchor is written.
- Trust moves to the storage provider's Object Lock and to whoever holds the bucket's write credentials (audit-logger pods): they can add anchors or acknowledgements, never remove one.
- The kind smoke test has no Object Lock store: anchoring is covered by unit tests and a manual check against an S3 emulator (2026-10-31), not by CI end to end.
