# ADR-0038: Release Images Are Scanned, Carry SBOM and Provenance, Are Signed Keyless, and Are Verified at Deploy

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0033](./0033-offsite-backup-bucket-object-lock.md) (same fail-before-change deploy model)
**Verified by:** manual review 2026-11-05

## Context

`release.yml` pushed 9 images with no vulnerability scan, no SBOM, no provenance and no signature, and `deploy.yml` deployed whatever digest the tag resolved to. A vulnerable or altered image could be published and deployed unnoticed (audit deploiement 2026-11-05, M6, issue #423).

## Decision

1. **Scan before publication.** Each image is built with `load: true`, then scanned by Trivy (`aquasecurity/trivy-action`, SHA-pinned) before the push step. Threshold: any `CRITICAL` vulnerability that has a fix (`ignore-unfixed: true`) fails the job; nothing is pushed.
2. **Exceptions** live in `.trivyignore` at the repository root, reviewed in the PR. One CVE per line, each preceded by a comment with reason, owner and expiry date.
3. **SBOM and provenance.** The push step sets `sbom: true` and `provenance: mode=max` for the 7 service images and the 2 tooling images.
4. **Keyless signature.** Job `sign` of `release.yml` signs each pushed digest with cosign (OIDC GitHub, SHA-pinned `sigstore/cosign-installer`). `id-token: write` is granted to that job only.
5. **Verification at deploy.** `deploy.yml`, right after "Resolve image digests", runs `cosign verify` on every `image@digest` with issuer `https://token.actions.githubusercontent.com` and identity regexp `^https://github\.com/<repository>/\.github/workflows/release\.yml@refs/tags/v`. Any failure stops the deploy before the first `kubectl` change.
6. **Rollback / compatibility.** Tags published before this ADR are unsigned and can no longer be deployed through `deploy.yml`; redeploy by publishing a new release tag. `rollout undo` in the cluster is unaffected.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Scan after push | The vulnerable image would already be published under its tag |
| `actions/attest-build-provenance` | Needs `attestations: write`; BuildKit provenance and SBOM cover the need with fewer permissions |
| Key-based cosign signing | A long-lived private key to store and rotate; keyless uses the workflow identity |
| Fail on HIGH too | Noise on base-image CVEs without a fix path; can be tightened by a new ADR |
| Dependency scan of `bun.lock` (OSV-Scanner) | Out of this change; can be added to `ci.yml` |
