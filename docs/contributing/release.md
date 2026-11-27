# Release

A release is a git tag `vX.Y.Z` pushed to `origin`. The tag triggers the **Release** workflow (`.github/workflows/release.yml`, `on: push: tags: v*`). The workflow has no manual trigger and publishes only container images.

## 1. Cut the tag (`scripts/release.mjs`)

Nominal flow (the tag needs a scanned candidate of its tree, section 2): from an up-to-date `development`, `git switch -c release/vX.Y.Z`, `bun scripts/release.mjs --prepare` (plus `--prerelease rc` for a prerelease), push, PR to `main`; wait for `release-candidate / publish` green, merge with a merge commit (its tree is the PR head's: `--prepare` merged `main` first), then `git tag -a vX.Y.Z <merge commit>` and `git push origin vX.Y.Z`. A hotfix PR to `main` is scanned the same way.

`release:publish` is a fallback only: its version commit is made on `main`, so no candidate has its tree and `release.yml` fails without publishing. Running `release-candidate.yml` by hand on `main` then re-running the release works, but the first scan then runs after the tag: a red one burns the tag again.

`release:publish` runs from `main` and merges the **local** `development` itself, so `git pull --ff-only origin` both branches first; plain `release` assumes the merge is already done. `release:publish` commits with `git add -A`: the whole working tree enters the release commit, so start clean.

| Command | Effect |
| ------- | ------ |
| `bun run release --dry-run` | Show the bump and the changelog, write nothing |
| `bun run release` | Read the gitmoji commits since the last tag, bump the root version, set every `services/*/package.json` to it (the root version is the tag and the image tag; services have no version of their own) and bump the touched `packages/*` versions, prepend `CHANGELOG.md`. Does not commit, tag or push |
| `bun run release:publish` | Same, then commit `:rocket:(release): vX.Y.Z`, create the annotated tag, `git push --follow-tags`. Refuses to run off `main`; merges `development` into `main` first |
| `bun scripts/release.mjs --prepare` | Merges `origin/main` (else `main`) into the current branch first, so the last tag and `main`'s CHANGELOG / versions are its base and the PR to `main` has no conflict (no back-merge of `main` into `development`): a conflict on `CHANGELOG.md` takes `main`'s, on a `package.json` keeps `development`'s content or deletion with `main`'s version, any other one stops (exit 1). Then same as `release`, then only `git add -A` + commit `:rocket:(release): vX.Y.Z`: no tag or push. Refuses to run off a `release/*` branch or on a dirty tree, and with `--publish`, `--version` or `--dry-run`. Last output line: `version=vX.Y.Z`. For the flow `release/vX.Y.Z` from `development` → PR to `main` → tag of the merge commit. That PR must be merged with a merge commit, never squashed: a squash leaves `development`'s history out of `main`, so the next `--prepare` hits a conflict on any file changed in both cycles |
| `--bump major\|minor\|patch`, `--version X.Y.Z` | Force the bump (`bun run release --bump minor`; `--version` edits the root and the services `package.json`) |
| `--prerelease <id>` (alone, or also with `--dry-run`, `--publish` or `--prepare`) | Release `X.Y.Z-<id>.N` instead of `X.Y.Z`: commit `:rocket:(release): vX.Y.Z-<id>.N`, tag `vX.Y.Z-<id>.N`. `N` is 1 + the highest tag `vX.Y.Z-<id>.N`; the script runs `git fetch --tags` first (its failure is ignored, so without a reachable remote only local tags count). Cannot be combined with `--version`. An option value that is missing or starts with `-` (`--prerelease --dry-run`) exits 1 before anything is written |

Automatic bump: a breaking commit (`:boom:`, `!:`) is major, a feature commit (`:sparkles:`, `:tada:`, `:label:`) is minor, anything else is patch.

Prerelease tags never serve as a base. `X.Y.Z` is computed from the last **stable** tag (`git describe --exclude '*-*'`) and the commits since it, the release commits of earlier prereleases excluded; each touched `packages/*` is bumped from its version at that tag. So `v3.0.0` + a feature gives `3.1.0-rc.1`, then `3.1.0-rc.2`, then the stable `3.1.0`, and a library goes `1.0.0 → 1.1.0` once, not once per prerelease. An unknown option stops the script (exit 1) before anything is written. `bun run release:test` (CI `lint` job) runs these cases on a throwaway git repository.

`--publish` stops with exit 1, the failing command and its stderr when `git add`, `commit`, `tag` or `push` fails, and checks with `git ls-remote --tags origin vX.Y.Z` that the tag reached `origin` before printing "published".

## 2. Workflow "Release"

1. `version`: the tag must match `vX.Y.Z` or `vX.Y.Z-prerelease`, else the run fails. Image tag is `X.Y.Z` (no `v`). `latest` is set only for a stable tag that is the highest stable `v*` tag on `origin`: a prerelease or a backport patch never takes it.
2. Before the tag, workflow `release-candidate.yml` (release PR to `main`, or manual) builds the 13 images, scans them (Trivy by digest) and pushes them under `:scan-<run id>`, then (job `publish`, only if every scan passed) as `:tree-<git tree>`, unsigned. Owner action: make `release-candidate / publish` a required check of the `main` ruleset, otherwise a red candidate can still be merged and tagged. Each scan job records the digest it scanned (artifact `digest-<image>`, after a green Trivy). `version` takes the newest run whose head has the tag's tree (`git rev-parse vX.Y.Z^{tree}`) and reads those digests; no run, a newest run not green, or a missing digest fails it before the approval. The CI is not replayed at the tag.
3. After the `release` approval, `sign` promotes each recorded digest (never a tag read later) to `:X.Y.Z` (+ `:latest`) and signs it to `IMAGE_REGISTRY` (repository variable, default `ghcr.io/<owner>`).
4. `verify-images`: reads `env.IMAGES` from `deploy.yml` and resolves each `<registry>/<image>:X.Y.Z` with `docker buildx imagetools inspect`, the same loop as the deploy step "Resolve image digests". It fails with the list of missing images.
5. `sign` (before `verify-images`): signs the digest of each image with cosign (keyless, ADR-0038). `deploy.yml` refuses any digest without this signature.

A green run therefore means `deploy.yml` can resolve **and** verify every image of this tag. `tests/k8s/check-overlays.mjs` (CI) fails earlier when an `IMAGES` entry is not built by this workflow, or when the `sign` matrix differs from `IMAGES`.

## 3. Deploy

Deployment is separate: the manual `deploy.yml` (`workflow_dispatch`) takes an image tag (`1.2.3` or `v1.2.3`), resolves it to digests and applies by digest. See [DEPLOY.md](../deployment/DEPLOY.md). The cluster must be able to pull the images: GHCR packages public, or pull credentials on the nodes ([CI/CD](../ci-cd/README.md#docker-image-tags)); a package exists only after the first push of its image.

A release that adds or changes a ClusterRole or ClusterRoleBinding of an overlay (3.1.0: `prometheus-nodes`, ADR-0056) needs an admin step before its deployment, in each environment: the deploy-cluster identity may only read them (ADR-0041). From a checkout of the release, run `bash scripts/deploy-identity.sh cluster --namespace <namespace> --environment <overlay>` as cluster admin (staging-local: `bash deploy/staging-local/bootstrap.sh identities`), then deploy. 3.1.0 also needs the application identity re-run (the Role `deploy-app` gained `leases` for the collector Lease, ADR-0057): `bash scripts/deploy-identity.sh app --namespace <namespace> | base64 -w0 | gh secret set KUBECONFIG_<ENV>_APP --env <env>` (staging-local: the same `bootstrap.sh identities` does both). Without it, the deploy step "Check deploy-app Role" (`deploy/k8s/scripts/check-app-rbac.sh`) stops before any apply with that command, and the step "Check overlay ClusterRoles" (`deploy/k8s/scripts/check-cluster-rbac.sh`) stops before any apply and prints that command with the missing or different objects.

3.2.2 needs the same admin steps, plus metrics-server: `check-prereqs.sh` (deploy step "Check cluster prerequisites") refuses a render with an HPA when the APIService `v1beta1.metrics.k8s.io` is not `Available`, and both identities gained rights (`deploy-cluster`: `get apiservices`; `deploy-app`: `create pods`; the Role `deploy-check-ingress` in `ingress-nginx`). Staging-local: `bash deploy/staging-local/bootstrap.sh prereqs`, then `bash deploy/staging-local/bootstrap.sh identities`. Other environments: install metrics-server, then, from a checkout of the release, `bash scripts/deploy-identity.sh app` and `bash scripts/deploy-identity.sh cluster` as above.

## One-off MongoDB DLQ import

The release that retires message-manager and dlq-service (ADR-0073, issue #1241) ships the manifests without `mongo-dlq`, and `deploy.yml` never prunes: the running `mongo-dlq` StatefulSet, its Services, PVCs, Secret keys and Jobs survive the deploy. Entries still in MongoDB are copied once to the dead streams by the audit-logger CLI, **before** those objects are deleted.

The same release moves risk-execution and decision-consumer onto the bus, with the new Redis users `risk-execution` and `decision-consumer` (`redis-ha.sh`). Redis only creates them when its pods restart: `deploy.yml` applies Redis last, and in staging-local, where `redis-0` is held by `partition: 1`, `deploy-release.sh redis-last` replaces it through a Sentinel failover, without stopping the master (issue #2882). No manual Redis restart. From v3.1.0, the first failover cannot hold writes on the old `redis-0` (its `ha` user predates ADR-0090): a bus entry written in the second before the switch can be lost, once (accepted by the owner). The smoke test fails if a Redis node refuses a bus user.

1. Deploy the release ([DEPLOY.md](../deployment/DEPLOY.md)). Rollback to the previous release is still possible here.
2. Import from an audit-logger pod, against the still-running `mongo-dlq` (values from the old Secret `trading-model-secrets`). The old `mongodb-network-policy` also survives the deploy, and its 27017 ingress only admits `dlq-service`, `mongodb` and `mongodb-init`: audit-logger would be refused and the import would time out. Open 27017 to audit-logger with a temporary NetworkPolicy for the duration of the import, then delete it. `app-role.yaml` grants create/delete on `networkpolicies`, so the namespace deploy identity (`KUBECONFIG_<ENV>_APP`) is enough. The URI lists `mongo-dlq-0..2`: on a 1-replica cluster (staging-local), check the members with `rs.conf()` first and keep only the existing ones.

   ```bash
   NS=trading-model   # or trading-model-staging
   kubectl -n "$NS" apply -f - <<'EOF'
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: mongo-dlq-import
   spec:
     podSelector:
       matchLabels:
         app.kubernetes.io/component: mongodb
     policyTypes:
       - Ingress
     ingress:
       - from:
           - podSelector:
               matchLabels:
                 app.kubernetes.io/component: audit-logger
         ports:
           - port: 27017
             protocol: TCP
   EOF
   kubectl -n "$NS" exec deploy/audit-logger -- env      MONGO_DLQ_URI='mongodb://mongo-dlq-0.mongo-dlq-headless:27017,mongo-dlq-1.mongo-dlq-headless:27017,mongo-dlq-2.mongo-dlq-headless:27017/dlq?replicaSet=rs0&authSource=admin&tls=true&tlsCAFile=/etc/mongo-tls/ca.crt'      MONGO_DLQ_USERNAME=dlq-service      MONGO_DLQ_PASSWORD="$(kubectl -n "$NS" get secret trading-model-secrets -o jsonpath='{.data.MONGO_DLQ_PASSWORD}' | base64 -d)"      node services/audit-logger/dist/application/dlq-cli.js <operator> import-mongo
   kubectl -n "$NS" delete networkpolicy mongo-dlq-import   # after the import (and its verification, step 3)
   ```

   Compose: `docker compose exec -e MONGO_DLQ_URI='mongodb://mongo:27017/dlq?authSource=admin' -e MONGO_DLQ_USERNAME=dlq-service -e MONGO_DLQ_PASSWORD="$MONGO_DLQ_PASSWORD" audit-logger node services/audit-logger/dist/application/dlq-cli.js <operator> import-mongo`. `MONGO_DLQ_DB` defaults to `dlq`; the collection is `dlq_entries`.
3. Verify. It copies the entries whose status is not `completed` to `trading-model:message-manager:dead:<topic>`, once per Mongo `_id` (Redis set `…:dead-imported`), and prints `{eligible, written, alreadyImported, unusable[]}`. The exit code is 0 only when `written + alreadyImported == eligible`, so a rerun after a failure is safe. Also compare `dlq-cli.js <operator> list <topic>` with what you expect; review `unusable`.
4. Only then, in the release after this one (contract step, issue #2619), delete the orphaned objects by hand. This release keeps them, with the Secret keys `REDIS_MESSAGE_MANAGER_PASSWORD`, `REDIS_DLQ_PASSWORD`, `MONGO_DLQ_PASSWORD`, `MONGO_DLQ_KEYFILE` and `DLQ_AUTH_HMAC_SECRET` and the Redis users `message-manager` / `dlq-service`, so that an N-1 pod restart or a rollback still starts:

   ```bash
   kubectl -n "$NS" delete statefulset/mongo-dlq service/mongo-dlq service/mongo-dlq-headless      job/mongo-dlq-users pdb/mongo-dlq-pdb certificate/mongo-dlq-tls networkpolicy/mongodb-network-policy
   kubectl -n "$NS" delete pvc -l app=mongo-dlq   # data-mongo-dlq-N claims; check the label with `kubectl get pvc` first
   # The Secret keys above leave the sealed files with issue #2619, in the same release.
   ```

   Also delete the `mongodb-exporter` target of `mongo-dlq` if your environment added one by hand. Compose: `docker compose exec mongo mongosh -u root -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin --eval 'db.getSiblingDB("dlq").dropDatabase()'`.

**No return to the previous release after step 4**: it needs `mongo-dlq` and `dlq-service`. The `import-mongo` subcommand and `MONGO_DLQ_*` go from the CLI in the release after this one (issue #2619).

## Compatibility with the previous release (ADR-0061)

CI fails a PR that breaks the public OpenAPI (`oasdiff breaking`) or a bus message schema against the last stable tag. Locally: `bun run contracts:write` after changing a message schema, then `bun run contracts:compat`. Allowed: optional fields, enum values, routes added. A forbidden change is split over two releases; an intentional break is declared in `docs/services/events/breaking-exceptions.json` (messages, the exact line printed) or `docs/services/openapi/oasdiff-ignore.txt` (OpenAPI), reviewed in the PR.
