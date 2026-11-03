# ADR-0035: SealedSecrets Controller Keys Backed Up Daily by a Scheduled GitHub Actions Workflow

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0034](./0034-backup-key-custody-and-weekly-escrow-check.md) (dedicated GitHub environment, two age recipients), [ADR-0033](./0033-offsite-backup-bucket-object-lock.md) (off-site bucket, credentials without delete right), [ADR-0011](./0011-spiffe-spire-workload-identity.md), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `tests/backup/sealed-secrets-key.test.sh`

## Context

The production secrets are SealedSecrets committed in `deploy/k8s/secrets/`. Only the private keys of the Sealed Secrets controller decrypt them, and those keys lived in the cluster only (Secrets labelled `sealedsecrets.bitnami.com/sealed-secrets-key` in `kube-system`). The total outage recovery of `docs/deployment/BACKUP_DR.md` started with "deploy the manifests from git", which fails on every SealedSecret in a new cluster (audit sauvegarde-restauration 2026-11-01, finding A5, issue #328).

`scripts/backup-sealed-secrets-key.sh` (export of every key, sealed with age for `BACKUP_AGE_RECIPIENTS`, copied to the off-site bucket) and `scripts/restore-sealed-secrets-key.sh` close the gap for one run. The question left was who runs the backup, and when. The controller creates a new key every 30 days and keeps the old ones: a key never backed up is lost with the cluster, together with every secret sealed with it. Automating the backup gives something the right to read private keys of `kube-system`. Four options were put to the project owner: operator procedure only, a step of `deploy.yml`, a CronJob in the cluster, a scheduled GitHub Actions workflow. The owner chose the scheduled workflow (issue #328, 2026-11-03).

## Decision

1. **Daily scheduled workflow** `.github/workflows/sealed-secrets-key-backup.yml` (03:30 UTC, also on demand) runs `scripts/backup-sealed-secrets-key.sh` against the production cluster, in the `backup-tools` image. A key renewed by the controller is off-site within 24 h, whether or not a deploy follows. Staging has no SealedSecret (plain development secrets) and is not backed up.
2. **Dedicated GitHub environment `sealed-secrets-key-backup`**, deployment branches restricted to the default branch, no required reviewer (it would block the schedule, as for ADR-0034). It holds the secret `SEALED_SECRETS_BACKUP_KUBECONFIG`, the put credentials of the off-site bucket (`BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY`, no delete right, ADR-0033) and the variables `BACKUP_AGE_RECIPIENTS`, `BACKUP_S3_*`, `SEALED_SECRETS_NAMESPACE`. The deploy jobs never receive this kubeconfig; this job never receives the deploy kubeconfig.
3. **Least-privilege cluster identity**, never an admin kubeconfig: `scripts/sealed-secrets-backup-identity.sh` creates in the controller namespace the ServiceAccount `sealed-secrets-key-backup`, a Role with the single rule `list` on `secrets` (what `kubectl get secret -l <label>` needs: no `get`, `watch`, write, other resource or namespace), its RoleBinding and a token Secret, and prints the kubeconfig on stdout, piped straight into the GitHub secret. `--rotate` replaces the token. The kind drill checks the rights with `kubectl auth can-i` and runs the real backup with this identity.
4. **Handling of the kubeconfig in the job**: written to a tmpfs, mode 600, never in an argument or a log, passed to the container by file, deleted in an `always()` step. Production rules apply: `BACKUP_MIN_RECIPIENTS=2` (operator + escrow keys, ADR-0034), encryption and off-site copy mandatory.
5. **Failure is a run failure**: a missing secret or variable, an unreachable API server or bucket, no key found, age or the copy failing: exit 1, GitHub notifies on the failed scheduled run. Never a skipped backup.
6. **The operator procedure stays** for what the schedule does not see: right after a manual key renewal, a controller reinstall or a restore, and before sealing a secret, an operator may run the script (or trigger the workflow) instead of waiting for the next run.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Operator procedure only | No new right or secret, but rests on discipline: an automatic renewal forgotten goes unnoticed. Not chosen by the project owner |
| Step of `deploy.yml` before the overlay is applied | No new right or secret, covers every secret deployed by the pipeline, but a renewal between two deploys waits for the next deploy. Not chosen |
| CronJob in the cluster (`db-backup` style, metrics and alerts) | Continuous coverage, but the job's pod holds both the right to list `kube-system` Secrets and the bucket credentials; limiting the right well needs the controller moved to its own namespace (migration). Not chosen |
| Admin kubeconfig of production in the environment | Simplest, but a leaked secret would give the whole cluster; the restricted ServiceAccount costs one script |
| `resourceNames` on the Role | Impossible: the controller names its keys `sealed-secrets-key<random>` |

## Consequences

- A production cluster credential is stored in GitHub. Whoever can read the `sealed-secrets-key-backup` environment secrets (a repository admin, a workflow change merged to the default branch, a compromise of GitHub) can list every Secret of `kube-system`, the controller keys included, and so decrypt every SealedSecret of the repository. RBAC cannot filter by label: `list` on `secrets` covers the whole namespace. Accepted by the project owner. Mitigations: list-only identity in one namespace, dedicated environment restricted to the default branch, review on workflow changes, kubeconfig on tmpfs and deleted after each run, `--rotate` on a suspected leak (then rotate the controller keys and reseal, `docs/deployment/sealed-secrets.md`). Moving the controller to its own namespace would shrink the right to its keys only; it can supersede this point later.
- The Kubernetes API server must be reachable from GitHub-hosted runners, as for `deploy.yml`. A private API server needs a self-hosted runner for this workflow.
- After a total outage the new cluster has no `sealed-secrets-key-backup` identity: the scheduled run fails until an operator runs `sealed-secrets-backup-identity.sh` on it and updates the secret. That failure is the intended reminder (`BACKUP_DR.md`, total outage recovery).
- One file of a few kilobytes per day in `<bucket>/sealed-secrets-key/`, kept at least 30 days by Object Lock; no lifecycle rule expires the prefix (about 2 MB a year). The newest file always holds every key.
- Until the environment and its secrets exist, the scheduled run fails every day: that is the intended signal, not noise to silence.
- No error is swallowed (ADR-0017).
