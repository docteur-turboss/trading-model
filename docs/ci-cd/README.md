# CI/CD

The jobs, steps and versions live in `.github/workflows/*.yml`: read the file, not a copy. Actions are pinned by commit SHA (Dependabot keeps them up to date). The chain of CI jobs is also summarised in `AGENTS.md`.

## Workflows

| Workflow | File | Trigger | Jobs |
| -------- | ---- | ------- | ---- |
| CI | `ci.yml` | `pull_request`, `push` to `main` / `development` | `gate`, `lint`, `security`, `typecheck`, `test`, `db-integration`, `observability`, `k8s-overlays`, `contract`, `e2e`, `k8s-images`, `k8s`, `k8s-result` |
| Release candidate | `release-candidate.yml` | `pull_request` `release/*` → `main` from this repository (never a fork); manual | `images`, `scan-services` + `scan-tools` (one build per image pushed as `candidate-<short head sha>`, Trivy by digest), `release-candidate` (result) |
| Release | `release.yml` | push of a `v*` tag | `version`, `candidate` (newest `release-candidate.yml` run of the tag's tree, must be green), `sign` (promotes the candidate digest to `X.Y.Z`, signs it), `verify-images` (after `sign`); builds nothing |
| Image scan | `image-scan.yml` | `pull_request` to `development` touching a Dockerfile, `deploy/**`, `bun.lock` or `.trivyignore.yaml`; `push` to `development`; daily cron; manual | `images` (services from `deploy.yml` `IMAGES`, tools from the `release-candidate.yml` `scan-tools` matrix), `scan-services` + `scan-tools`: local build (no push) and the same Trivy gate as the release, so a base image CVE shows up before the tag; not part of `k8s-result` |
| Deploy | `deploy.yml` | manual | Staging / production deploy by digest (optional canary, smoke test, auto rollback) |
| Deploy compose | `deploy-compose.yml` | manual (release tag) | Compose stack deploy by digest on the self-hosted runner (ADR-0086) |
| Backup Restore Test | `backup-test.yml` | weekly cron, pull request touching backup scripts, manual | Backup / restore scripts, dry-run restore |
| Backup Key Check | `backup-key-check.yml` | weekly cron, manual | Escrow age key decrypts the newest off-site backup ([ADR-0034](../adr/0034-backup-key-custody-and-weekly-escrow-check.md)) |
| Mutation Testing | `mutation-testing.yml` | weekly cron, manual | Stryker; not a PR gate |
| SealedSecrets Key Backup | `sealed-secrets-key-backup.yml` | daily cron, manual | Seal and copy the controller keys off-site ([ADR-0035](../adr/0035-sealed-secrets-key-daily-backup-by-github-actions.md)) |
| Secret Rotation Reminder | `secret-rotation-reminder.yml` | quarterly cron, manual | Open a "Quarterly secret rotation" issue unless one is open |

The release tag is created by `bun run release:publish` ([release.md](../contributing/release.md)). No image is pushed unless the whole CI passes on the tagged commit. `sign` must cover the same images as `deploy.yml` `IMAGES` (`tests/k8s/check-overlays.mjs`).

## Docker Image Tags

Each image is pushed as `:X.Y.Z`. `:latest` moves to the release only when it is the highest stable version among the repository tags: a backport patch or a prerelease never takes it.

Registry: repository variable `IMAGE_REGISTRY`, default `ghcr.io/<owner>`. Manifests keep the logical name `ghcr.io/trading-model/<image>`; `deploy.yml` rewrites it to the registry. `release.yml` pushes with `GITHUB_TOKEN`; no personal access token is needed.

The cluster pulls the images itself: make the GHCR packages public, or give the nodes pull credentials for the registry.

## References

- [Docker Standards](../deployment/DOCKER.md), [Deployment Guide](../deployment/DEPLOY.md)
- [PR Standards](../standards/pr-standards.md), [Quality Gates](../standards/quality-gates.md), [Workflow](../contributing/workflow.md)
