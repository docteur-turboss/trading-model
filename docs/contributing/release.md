# Release

A release is a git tag `vX.Y.Z` pushed to `origin`. The tag triggers the **Release** workflow (`.github/workflows/release.yml`, `on: push: tags: v*`). The workflow has no manual trigger and publishes only container images.

## 1. Cut the tag (`scripts/release.mjs`)

`release:publish` runs from `main` and merges `development` itself; plain `release` assumes the merge is already done. `release:publish` commits with `git add -A`: the whole working tree enters the release commit, so start clean.

| Command | Effect |
| ------- | ------ |
| `bun run release:dry` | Show the bump and the changelog, write nothing |
| `bun run release` | Read the gitmoji commits since the last tag, bump the root version, set every `services/*/package.json` to it (the root version is the tag and the image tag; services have no version of their own) and bump the touched `packages/*` versions, prepend `CHANGELOG.md`. Does not commit, tag or push |
| `bun run release:publish` | Same, then commit `:rocket:(release): vX.Y.Z`, create the annotated tag, `git push --follow-tags`. Refuses to run off `main`; merges `development` into `main` first; runs `bun run docs:generate` before the commit |
| `--bump major\|minor\|patch`, `--version X.Y.Z` | Force the bump (`release:bump`, `release:version`; `--version` edits the root and the services `package.json`) |
| `--prerelease <id>` (alone, or also with `--dry-run` or `--publish`) | Release `X.Y.Z-<id>.N` instead of `X.Y.Z`: commit `:rocket:(release): vX.Y.Z-<id>.N`, tag `vX.Y.Z-<id>.N`. `N` is 1 + the highest tag `vX.Y.Z-<id>.N`; the script runs `git fetch --tags` first (its failure is ignored, so without a reachable remote only local tags count). Cannot be combined with `--version`. An option value that is missing or starts with `-` (`--prerelease --dry-run`) exits 1 before anything is written |

Automatic bump: a breaking commit (`:boom:`, `!:`) is major, a feature commit (`:sparkles:`, `:tada:`, `:label:`) is minor, anything else is patch.

Prerelease tags never serve as a base. `X.Y.Z` is computed from the last **stable** tag (`git describe --exclude '*-*'`) and the commits since it, the release commits of earlier prereleases excluded; each touched `packages/*` is bumped from its version at that tag. So `v3.0.0` + a feature gives `3.1.0-rc.1`, then `3.1.0-rc.2`, then the stable `3.1.0`, and a library goes `1.0.0 → 1.1.0` once, not once per prerelease. An unknown option stops the script (exit 1) before anything is written. `bun run release:test` (CI `lint` job) runs these cases on a throwaway git repository.

The script does not stop on a failed `commit`, `tag` or `push` and still prints "published". Check `git tag -l vX.Y.Z` and `git ls-remote --tags origin vX.Y.Z` afterwards.

## 2. Workflow "Release"

1. `version`: the tag must match `vX.Y.Z` or `vX.Y.Z-prerelease`, else the run fails. Image tag is `X.Y.Z` (no `v`). `latest` is set only for a stable tag that is the highest stable `v*` tag on `origin`: a prerelease or a backport patch never takes it.
2. `ci`: the whole `ci.yml` runs again on the tagged commit (reusable workflow). No image is pushed if a gate fails.
3. `build-and-push` (7 service images) and `build-tools` (`spire-tools`, `backup-tools`, `db-migrate`): 10 images pushed as `:X.Y.Z` (+ `:latest`) to `IMAGE_REGISTRY` (repository variable, default `ghcr.io/<owner>`).
4. `verify-images`: reads `env.IMAGES` from `deploy.yml` and resolves each `<registry>/<image>:X.Y.Z` with `docker buildx imagetools inspect`, the same loop as the deploy step "Resolve image digests". It fails with the list of missing images.
5. `sign` (in parallel with `verify-images`): signs the digest of each image with cosign (keyless, ADR-0038). `deploy.yml` refuses any digest without this signature.

A green run therefore means `deploy.yml` can resolve **and** verify every image of this tag. `tests/k8s/check-overlays.mjs` (CI) fails earlier when an `IMAGES` entry is not built by this workflow, or when the `sign` matrix differs from `IMAGES`.

## 3. Deploy

Deployment is separate: the manual `deploy.yml` (`workflow_dispatch`) takes an image tag (`1.2.3` or `v1.2.3`), resolves it to digests and applies by digest. See [DEPLOY.md](../deployment/DEPLOY.md).

A release that adds or changes a ClusterRole or ClusterRoleBinding of an overlay (3.1.0: `prometheus-nodes`, ADR-0056) needs an admin step before its deployment, in each environment: the deploy-cluster identity may only read them (ADR-0041). From a checkout of the release, run `bash scripts/deploy-identity.sh cluster --namespace <namespace> --environment <overlay>` as cluster admin (staging-local: `bash deploy/staging-local/bootstrap.sh identities`), then deploy. 3.1.0 also needs the application identity re-run (the Role `deploy-app` gained `leases` for the collector Lease, ADR-0057): `bash scripts/deploy-identity.sh app --namespace <namespace> | base64 -w0 | gh secret set KUBECONFIG_<ENV>_APP --env <env>` (staging-local: the same `bootstrap.sh identities` does both). Without it, the deploy step "Check deploy-app Role" (`deploy/k8s/scripts/check-app-rbac.sh`) stops before any apply with that command, and the step "Check overlay ClusterRoles" (`deploy/k8s/scripts/check-cluster-rbac.sh`) stops before any apply and prints that command with the missing or different objects.

## 4. First release of the current pipeline

No release has been published by the current `release.yml` yet. The tags `v2.0.0` to `v2.0.3` are **not deployable** by `deploy.yml`: `v2.0.0`, `v2.0.1` and `v2.0.2` have failed Release runs, and `v2.0.3` was published by the old workflow under `ghcr.io/docteur-turboss/trading-model/<service>`, without `spire-tools` and `backup-tools`. `deploy.yml` reads `<registry>/<image>:<tag>`, so it stops at "Resolve image digests" for each of these tags. Even republished under the right path, these images would fail "Verify image signatures": they carry no cosign signature from `release.yml`. `image_tag: latest` fails the same way until the first release below is published.

A human runs every step: merging to `main`, pushing the tag and deploying are never automated.

### Prerequisites

- `development` is green in CI (every job, `k8s` included) and holds everything the release must ship.
- Repository variable `IMAGE_REGISTRY` is either unset (default `ghcr.io/<owner>`, lowercased) or a registry `GITHUB_TOKEN` can push to. `deploy.yml` reads the same variable.
- The GitHub environment `staging` has the secrets listed in [DEPLOY.md](../deployment/DEPLOY.md#prerequisites-secrets) (`KUBECONFIG_STAGING`, alerting, backup bucket).
- The staging cluster can pull from the registry: GHCR packages public, or pull credentials on the nodes ([CI/CD](../ci-cd/README.md#docker-image-tags)). The packages are created by the first push, so this can only be done after step 3.
- A clean clone with `bun install --frozen-lockfile` done: `release:publish` commits with `git add -A`.

### Steps

1. Update both local branches. `release:publish` merges the **local** `development` into the local `main`:

   ```bash
   git checkout development && git pull --ff-only origin development
   git checkout main && git pull --ff-only origin main
   ```

2. Preview, then publish. `release:publish` merges `development`, bumps the versions, writes `CHANGELOG.md`, commits `:rocket:(release): vX.Y.Z`, tags and runs `git push --follow-tags`:

   ```bash
   bun run release:dry
   bun run release:publish
   ```

3. Check that the tag reached `origin` (the script prints "published" even when a step failed):

   ```bash
   git tag -l vX.Y.Z
   git ls-remote --tags origin vX.Y.Z
   ```

4. Wait for the **Release** run of the tag (Actions → Release, or `gh run list --workflow release.yml`). Every job must be green, `sign` and `verify-images` included.

5. Check the 9 digests yourself, as `deploy.yml` will (log in first with `docker login ghcr.io` if the packages are private):

   ```bash
   REGISTRY=ghcr.io/<owner>   # or the value of IMAGE_REGISTRY, lowercased
   TAG=X.Y.Z                  # no leading v
   for img in discovery-server message-manager financial-scraper trader-trainer \
              api-gateway audit-logger dlq-service spire-tools backup-tools; do
     docker buildx imagetools inspect "$REGISTRY/$img:$TAG" --format '{{.Manifest.Digest}}' \
       || echo "MISSING $img"
   done
   ```

   The list is `env.IMAGES` of `.github/workflows/deploy.yml`: read it there if it has changed.

6. Make the packages pullable by the staging cluster (see prerequisites).

7. Run the first deployment on staging: Actions → **Deploy** → Run workflow, `environment: staging`, `image_tag: vX.Y.Z`, `canary: false`. Or:

   ```bash
   gh workflow run deploy.yml -f environment=staging -f image_tag=vX.Y.Z
   ```

   The run must pass "Resolve image digests", the rollout and the smoke test. Production follows the same way once staging is verified ([DEPLOY.md](../deployment/DEPLOY.md#production-deployment)).
