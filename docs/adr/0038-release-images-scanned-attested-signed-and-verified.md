# ADR-0038: Release Images Are Scanned, Carry SBOM and Provenance, Are Signed Keyless, and Are Verified at Deploy

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0033](./0033-offsite-backup-bucket-object-lock.md) (same fail-before-change deploy model)
**Verified by:** manual review 2026-11-05; `tests/k8s/check-overlays.mjs` (image lists), `.github/workflows/release-candidate.yml`

## Context

`release.yml` pushed 9 images with no vulnerability scan, no SBOM, no provenance and no signature, and `deploy.yml` deployed whatever digest the tag resolved to. A vulnerable or altered image could be published and deployed unnoticed (audit deploiement 2026-11-05, M6, issue #423).

## Decision

1. **Scan before publication.** Each image is built once and pushed under the temporary tag `scan-<run id>`, then scanned by Trivy (`aquasecurity/trivy-action`, SHA-pinned) by digest: jobs `scan-services` and `scan-tools` build and scan the 13 images, and `sign` `needs` both and only then promotes the scanned digest to `X.Y.Z` (issues #2364, #2656). Threshold: any `CRITICAL` or `HIGH` vulnerability that has a fix (`ignore-unfixed: true`) fails its scan job; no image of the tag is promoted. Unfixed CVEs are not blocking (a rebuild cannot remove them); `HIGH` was added by issue #848 (previously `CRITICAL` only). The pre-merge scan of the 10 images (2026-11-11) found only fixed `HIGH` CVEs: the 7 service runtime images dropped `npm`/`npx` (unused; their bundled `undici` and `brace-expansion` carried 6 CVEs); the remainder (`spire-tools`, `backup-tools`, `db-migrate`: upstream binary or Debian base not yet bumped) are listed in `.trivyignore.yaml` with owner and expiry 2026-12-11.
2. **Exceptions** live in `.trivyignore.yaml` at the repository root, reviewed in the PR. One entry per CVE with `statement` (reason, owner) and `expired_at`, which Trivy itself enforces: the scan fails again after that date.
3. **SBOM and provenance.** The push step sets `sbom: true` and `provenance: mode=max` for the 7 service images and the 2 tooling images.
4. **Keyless signature.** Job `sign` of `release.yml` signs each pushed digest with cosign (OIDC GitHub, SHA-pinned `sigstore/cosign-installer`). `id-token: write` is granted to that job only.
5. **Verification at deploy.** `deploy.yml`, right after "Resolve image digests", runs `cosign verify` on every `image@digest` with issuer `https://token.actions.githubusercontent.com` and identity regexp `^https://github\.com/<repository>/\.github/workflows/release\.yml@refs/tags/v`. Any failure stops the deploy before the first `kubectl` change.
6. **Rollback / compatibility.** Tags published before this ADR are unsigned and can no longer be deployed through `deploy.yml`; redeploy by publishing a new release tag. `rollout undo` in the cluster is unaffected.

7. **Approval before publication (issue #2180).** Job `approve` of `release.yml` carries `environment: release`; `scan-services`, `scan-tools` and `sign` depend on it: one approval per release (see "Who approves"). Job `check-environment` (no `environment:`) first refuses a missing or reviewer-less environment (`scripts/check-environment-protection.mjs release`). `ci.yml` is called without `secrets: inherit`.

   **Who approves (issue #2401, decision of the owner 2026-11-23, #2369).** The orchestrator approves `release` itself, under the owner's account (`POST actions/runs/<id>/pending_deployments`, `state=approved`, comment "Release <version> publiée par l'orchestrateur"), only for tags it pushed after the cross-review of the release PR and its merge to `main`. A tag pushed by hand is approved by hand. The reviewer still stops any `v*` tag or run the orchestrator did not start; only the owner can push such a tag (ruleset 27860882, #2183). **Accepted risk:** no person acts between the merge to `main` and the signature, so a faulty automatic cross-review publishes and signs. Check: `scripts/check-environment-protection.mjs release` (reviewer and `v*` tag rule stay in place).

8. **No build cache, scanned = promoted = signed.** Release builds use no `type=gha` cache (a push to `main` could plant layers in its scope). There is a single build per image (issue #2656, replaces the second no-cache build of #2364, which could differ from the scanned one); `sign` promotes the scanned digest with `docker buildx imagetools create` (same digest, tags `X.Y.Z` and `latest`) and signs that digest. The `scan-<run id>` tags are left in the registry.

9. **Build and scan before the tag; no CI replay (issue #3012).** Jobs `scan-services` and `scan-tools` moved to `release-candidate.yml` (release PR to `main`, or manual): they push the scanned images unsigned as `tree-<git tree of the commit>`. `release.yml` no longer calls `ci.yml`: its `version` job requires, for every `IMAGES` entry, an image tagged `tree-<git rev-parse $GITHUB_SHA^{tree}>`, so a tag whose tree was not built and scanned stops before the approval. The identity of the tree replaces the replay (squash or merge commits differ, the tree does not). `sign` retags that digest and signs it; signature, `latest` rule and approval stay in `release.yml` alone. Accepted risk: the release PR must have run CI and the candidate on the final tree; a main that moved between the PR and the merge changes the tree and fails `version` (re-run the candidate on `main` by hand).

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Scan after push | The vulnerable image would already be published under its tag |
| `actions/attest-build-provenance` | Needs `attestations: write`; BuildKit provenance and SBOM cover the need with fewer permissions |
| Key-based cosign signing | A long-lived private key to store and rotate; keyless uses the workflow identity |
| Fail on HIGH too | Noise on base-image CVEs without a fix path; can be tightened by a new ADR |
| Dependency scan of `bun.lock` (OSV-Scanner) | Out of this change; can be added to `ci.yml` |
