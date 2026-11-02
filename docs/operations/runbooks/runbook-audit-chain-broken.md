# Runbook: Audit Chain Broken or Not Verified

**Severity:** SEV1 (`AuditChainBroken`), SEV2 (`AuditChainVerificationStale`, `AuditChainAnchoringStale`), SEV3 (`AuditChainNotAnchored`)
**Alerts:** `AuditChainBroken`, `AuditChainVerificationStale`, `AuditChainAnchoringStale`, `AuditChainNotAnchored`
**Decision:** [ADR-0027](../../adr/0027-audit-chain-verification-and-anchoring.md)

The audit trail kept for MiFID II is a hash chain. Every 15 minutes
(`AUDIT_CHAIN_INTERVAL_MS`) audit-logger verifies the events written since the
last check and writes the verified head to the anchor store: an S3 bucket in
Object Lock compliance mode that nobody can rewrite. A broken chain is a
possible tampering or data loss: **preserve the evidence before changing
anything**.

## Get the report

```bash
POD=$(kubectl get pods -n trading-model -l app.kubernetes.io/component=audit-logger -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n trading-model "$POD" -c audit-logger -- \
  node services/audit-logger/dist/application/chain-cli.js report > chain-report.json
```

`verification.broken` names the first fault; exit code 1 when the chain is
broken. The same report is what auditors receive, on request.

## AuditChainBroken

| `broken` says | Meaning | Action |
| --- | --- | --- |
| `dataHash does not match the stored content` | an event was changed in MongoDB | incident: compare with the latest backup, find who wrote to `audit_events` (MongoDB logs, access) |
| `chainSequence N missing` / `previousHash is not the dataHash of N` | an event was deleted or the chain was rewritten in the middle | incident, as above |
| `differs from the anchor of …` | the chain was rewritten and rehashed after that anchor | incident: the anchor proves the original hash |
| `lies beyond the last event` / `the trail ends at …` | events after a sequence are gone | a restore from an older backup (expected, see below) or a deletion (incident) |
| `too recent to have expired` | old events removed before their retention ended | incident |

1. Take a forensic dump of the audit database and keep `chain-report.json`
   ([runbook-data-corruption](runbook-data-corruption.md), step 2).
2. Do not edit `audit_events` or `audit_chain_state` to make the alert go away.
3. Escalate to compliance: a broken audit trail may have to be reported.

### After a restore from an older backup

The anchors written after the backup now lie beyond the restored trail: the
alert is expected and the lost events are a real loss. Once the restore is
explained, record it (immutable, listed in every later report):

```bash
kubectl exec -n trading-model "$POD" -c audit-logger -- \
  node services/audit-logger/dist/application/chain-cli.js acknowledge-loss <first lost sequence> "restore of <date>, incident <id>"
```

The first lost sequence is the restored head + 1 (`head.chainSequence` in the
report). The next cycle verifies again; new events extend the restored chain.

## AuditChainVerificationStale

No verification completed for 45 minutes: audit-logger logs
`Audit chain cycle failed` with the cause (MongoDB unreachable most of the
time). Fix the cause; the next cycle resumes from the last verified point.

## AuditChainAnchoringStale

Verification runs but no anchor was written for 45 minutes: the bucket refuses
the writes. Check the `audit-anchor-s3` Secret (credentials, bucket, region,
endpoint), that the bucket has Object Lock enabled, and the egress to the
store (port 443).

## AuditChainNotAnchored

`AUDIT_ANCHOR_BUCKET` is not set: the chain is verified but a rewrite of the
whole chain would go unnoticed. Expected in compose and staging without a
bucket; production refuses to deploy without one. Set the GitHub environment
variables `AUDIT_ANCHOR_BUCKET`, `AUDIT_ANCHOR_REGION`, `AUDIT_ANCHOR_ENDPOINT`
(non-AWS) and the secrets `AUDIT_ANCHOR_ACCESS_KEY_ID`,
`AUDIT_ANCHOR_SECRET_ACCESS_KEY`, then redeploy.

## The anchor bucket

- Created with Object Lock enabled (it cannot be enabled later on most
  providers); compliance mode, retention set per object by audit-logger to
  `AUDIT_RETENTION_DAYS`.
- Its own credentials, allowed `s3:PutObject`, `s3:ListBucket`,
  `s3:GetObject` only: no delete, no lifecycle or bucket policy change. Not
  the backup bucket's credentials.
- Layout: `audit-chain/anchors/<sequence>-<hash>.json` (date = object
  LastModified, set by S3) and `audit-chain/acknowledgements/<sequence>-<date>.json`.
