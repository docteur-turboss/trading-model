# Sealed Secrets — Encrypted Kubernetes Secrets

The `trading-model-secrets` secret contains 11 sensitive values. Instead of storing them as plaintext in `kustomization.yaml` (which exposes them in git and requires manual `change-me-in-production` replacement), we use **Sealed Secrets** — encrypted secrets that are safe to commit to git.

## How it works

1. The **SealedSecrets controller** runs in the cluster and manages a cryptographic key pair
2. The **kubeseal** CLI encrypts secrets using the controller's public key
3. The encrypted `SealedSecret` can be committed to git — only the controller in the cluster can decrypt it
4. The controller decrypts and creates a standard `Secret` resource
5. The plaintext is never stored in git

## Setup

### 1. Install the SealedSecrets controller

```bash
bash scripts/install-sealed-secrets.sh             # v0.27.1, namespace sealed-secrets
bash scripts/install-sealed-secrets.sh --dry-run   # print the manifests, apply nothing
```

The script downloads the upstream `controller.yaml` v0.27.1 (sha256 pinned)
and installs it in the namespace **`sealed-secrets`**
(`deploy/k8s/sealed-secrets/namespace.yaml`, Pod Security `restricted`), not
in `kube-system` where `controller.yaml` puts it (ADR-0035). The identity of
the daily key backup (below) can list every Secret of the controller
namespace, since RBAC cannot filter by label. In a namespace of its own it
reads the controller keys and its own token, and nothing else. Never deploy
anything else in `sealed-secrets`. A cluster whose controller already runs in
`kube-system`: [Move the controller out of kube-system](#move-the-controller-out-of-kube-system).
`deploy.yml` refuses a production deploy when no controller runs in
`sealed-secrets`.

`kubeseal` looks for the controller in `kube-system` by default: pass
`--controller-namespace sealed-secrets`, or export it once:

```bash
export SEALED_SECRETS_CONTROLLER_NAMESPACE=sealed-secrets
```

`scripts/init-sealed-secrets.sh` and `scripts/rotate-secrets.sh` already use
it (`CONTROLLER_NAMESPACE`, default `sealed-secrets`).

### 2. Encrypt your production secrets

```bash
# Create a temporary plaintext secret file (NOT committed to git)
kubectl create secret generic trading-model-secrets \
  --namespace trading-model \
  --from-literal=AUTH_TOKENS='your-real-tokens' \
  --from-literal=SIGNING_SECRET='your-signing-secret' \
  --from-literal=MYSQL_ROOT_PASSWORD='your-mysql-root-password' \
  --from-literal=MYSQL_PASSWORD='your-mysql-password' \
  --from-literal=MYSQL_MIGRATE_PASSWORD='your-migration-user-password' \
  --from-literal=MYSQL_RETENTION_PASSWORD='your-retention-user-password' \
  --from-literal=MYSQL_EXPORTER_PASSWORD='your-mysql-exporter-password' \
  --from-literal=DLQ_AUTH_HMAC_SECRET='your-dlq-hmac-secret' \
  --from-literal=GRAFANA_PASSWORD='your-grafana-password' \
  --from-literal=REDIS_INTERNAL_PASSWORD='your-redis-ha-password' \
  --from-literal=REDIS_DISCOVERY_PASSWORD='your-discovery-redis-password' \
  --from-literal=REDIS_MESSAGE_MANAGER_PASSWORD='your-message-manager-redis-password' \
  --from-literal=REDIS_DLQ_PASSWORD='your-dlq-redis-password' \
  --from-literal=REDIS_EXPORTER_PASSWORD='your-exporter-redis-password' \
  --from-literal=MONGO_ROOT_PASSWORD='your-mongo-root-password' \
  --from-literal=MONGO_EXPORTER_PASSWORD='your-mongo-exporter-password' \
  --from-literal=MONGO_BACKUP_PASSWORD='your-mongo-backup-password' \
  --from-literal=MONGO_AUDIT_PASSWORD='your-mongo-audit-password' \
  --from-literal=MONGO_DLQ_PASSWORD='your-mongo-dlq-password' \
  --from-literal=MONGO_AUDIT_KEYFILE="$(openssl rand -hex 64)" \
  --from-literal=MONGO_DLQ_KEYFILE="$(openssl rand -hex 64)" \
  --dry-run=client -o yaml > /tmp/plaintext-secret.yaml

# Seal it (requires kubeseal CLI)
kubeseal --controller-namespace sealed-secrets -o yaml < /tmp/plaintext-secret.yaml > deploy/k8s/secrets/trading-model-sealed-secrets.yaml

# Clean up
rm /tmp/plaintext-secret.yaml
```

### Adding one key to an existing SealedSecret

The controller rewrites `Secret.data` from the SealedSecret it owns: a file with a single entry erases every other key (`MYSQL_ROOT_PASSWORD`, `SIGNING_SECRET`...) from the live Secret. Never seal one key into a new file. Merge it:

```bash
kubectl create secret generic trading-model-secrets -n trading-model   --from-literal=MYSQL_MIGRATE_PASSWORD='value' --dry-run=client -o yaml   | kubeseal --controller-namespace sealed-secrets --merge-into deploy/k8s/secrets/trading-model-sealed-secrets.yaml
```

The final file must list ALL keys. `run-migrations.sh` refuses to apply a file that lacks a key of the live Secret. A file that adds a key is applied by `run-migrations.sh` before the migrations, which then wait for the controller to write the key: `db-migrate-user` and the database pods the overlay restarts see it (issue #698).

### Removing an obsolete key (contract step, ADR-0040)

`run-migrations.sh` compares the keys of the LIVE Secret with the file, not with what the previous release mounts. Remove a key in this order:

1. Release N stops mounting the key (no `secretKeyRef` in `deploy/k8s`: `grep -r KEY deploy/k8s`). Publish it.
2. Release N+1 removes the key from the SealedSecret file(s), `ci-render.mjs` and `init-sealed-secrets.sh`. The previous release (N) must be a published tag that no longer mounts it, otherwise its pods fail with `CreateContainerConfigError` on restart.
3. Deploy N+1 with the GitHub environment variable `RETIRED_SECRET_KEYS="KEY"` (space-separated, read by `deploy.yml`): the guard then accepts the file without that key. The controller erases the key when the overlay is applied.
4. Next release: stop passing it.

### Rotating secrets

```bash
bash scripts/rotate-secrets.sh --component signing|tokens|dlq|all
DRY_RUN=true bash scripts/rotate-secrets.sh --component dlq   # no merge, apply or restart
```
Before `kubectl apply` the script compares the live Secret keys with the file: a live key missing from `SEALED_SECRETS_FILE` stops it (the controller would erase that key). The merged file stays on disk; add the key with `kubeseal --merge-into`, then rerun.

| Component | Key | Restarted |
|-----------|-----|-----------|
| `signing` | `SIGNING_SECRET` | discovery-server (services re-register) |
| `tokens` | `AUTH_TOKENS` (`name:scopes:secret`, ADR-0059): only the entry named `API_KEY_NAME` (default `ops`, scopes `API_KEY_SCOPES`) is replaced, the other keys are kept | api-gateway |
| `dlq` | `DLQ_AUTH_HMAC_SECRET` | message-manager + dlq-service |

The script merges the new key into `SEALED_SECRETS_FILE` (default `deploy/k8s/secrets/trading-model-sealed-secrets.yaml`, commit the result), applies it, waits until the live Secret holds the value, then restarts the consumers. It never prints a value and never puts one on a command line. `SEALED_SECRETS_FILE` must be the real sealed file of the overlay: a file with `CHANGE_ME` placeholders is refused before any `kubeseal` or `apply`.

For `tokens`, the new key is written to a `0600` temporary file whose path is logged: give the key to the client, then delete the file. Without that file, read it with `kubectl get secret trading-model-secrets -n trading-model -o jsonpath='{.data.AUTH_TOKENS}' | base64 -d`.

`--component all` has no rollback: if `dlq` fails after `signing`, the local file and the live Secret keep the keys already rotated. Fix the cause and rerun the failed component.

### Rotate a database password

`rotate-secrets.sh` refuses `MYSQL_*` and `REDIS_*_PASSWORD`: the password must change in the database first, then in the Secret, then in the pods.

1. Change it in the database (`ALTER USER ... IDENTIFIED BY` for MySQL; `ACL SETUSER <user> >new <-old` on every Redis node, or edit `redis-ha.sh` and rerun it).
2. Merge the new value (`kubeseal --merge-into`, see above) and apply the file.
3. Restart every consumer of the key (`kubectl rollout restart`), then the database pods for the exporter keys.

### 3. Apply

```bash
kubectl apply -f deploy/k8s/secrets/trading-model-sealed-secrets.yaml
```

## Back up the controller keys

The SealedSecrets of `deploy/k8s/secrets/` decrypt only with the private keys
of the controller that sealed them. They live in the cluster only: Secrets
labelled `sealedsecrets.bitnami.com/sealed-secrets-key` in the controller
namespace (`sealed-secrets`). Lose the cluster without a copy of them and no
SealedSecret of the repository decrypts in the new one: every secret must be
generated again, resealed and committed, and every API key rotated.

`scripts/backup-sealed-secrets-key.sh` exports **every** key Secret (the
controller adds a new key every 30 days and keeps the old ones to decrypt
what they sealed), encrypts the export with age for `BACKUP_AGE_RECIPIENTS`
while it is written (no plaintext on disk) and copies it to the off-site
bucket of the database backups, as
`<BACKUP_S3_BUCKET>/sealed-secrets-key/sealed-secrets-key_<TIMESTAMP>.yaml.age`.
It runs every day from the scheduled workflow
`.github/workflows/sealed-secrets-key-backup.yml` (below, ADR-0035), and by
hand from an operator workstation with a kubeconfig that can list the
Secrets of `sealed-secrets`:

```bash
# Same recipients and bucket as production (GitHub environment `production`)
export BACKUP_AGE_RECIPIENTS="age1...operator age1...escrow" BACKUP_MIN_RECIPIENTS=2
export BACKUP_S3_BUCKET=s3://bucket/prefix AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=...
export RCLONE_S3_ENDPOINT=https://s3.example.net RCLONE_S3_PROVIDER=Other   # non-AWS store only
bash scripts/backup-sealed-secrets-key.sh
bash scripts/backup-sealed-secrets-key.sh --dest /media/usb   # also keep the encrypted file
```

Exit 1, with nothing written, when no key Secret is found
(`SEALED_SECRETS_NAMESPACE`, default `sealed-secrets`), or when kubectl, age or
the off-site copy fails. Encryption and the bucket are mandatory: same
recipient rules as the backup CronJob (`BACKUP_MIN_RECIPIENTS`,
[Key custody](ENCRYPTION_AT_REST.md#key-custody)). The file holds only what
the controller reads (name, labels, type, data), so it applies to any new
cluster.

A key created since the last backup is lost with the cluster, and so are
the secrets sealed with it. The daily workflow backs up an automatic key
renewal (every 30 days by default, `--key-renew-period`) within 24 h. Do not
wait for the next run, and run the script or the workflow (`gh workflow run
sealed-secrets-key-backup.yml`) by hand:

- after every manual key renewal (see [Key rotation](#key-rotation));
- after the controller is installed or reinstalled on a cluster, and after
  a restore (below);
- before sealing a new secret with `kubeseal` or `scripts/init-sealed-secrets.sh`.

List the keys and their dates with
`kubectl -n sealed-secrets get secret -l sealedsecrets.bitnami.com/sealed-secrets-key`:
a key newer than the newest `sealed-secrets-key_<TIMESTAMP>.yaml.age` of the
bucket is not backed up yet.

### Daily backup by GitHub Actions

`.github/workflows/sealed-secrets-key-backup.yml` runs the script every day
at 03:30 UTC (and on demand) against the production cluster, in the
`backup-tools` image (ADR-0035). Staging has no SealedSecret and is not
backed up. Everything comes from the GitHub environment
`sealed-secrets-key-backup`: deployment branches restricted to the default
branch, **no required reviewer** (it would block the schedule).

| Name | Kind | Value |
| ---- | ---- | ----- |
| `SEALED_SECRETS_BACKUP_KUBECONFIG` | secret | kubeconfig of the `sealed-secrets-key-backup` ServiceAccount (below), never an admin kubeconfig |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | secrets | put credentials of the off-site bucket, without delete right (ADR-0033), as in the `production` environment |
| `BACKUP_AGE_RECIPIENTS` | variable | operator and escrow public keys, as in `production` (2 required, ADR-0034) |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_PROVIDER` | variables | as in `production` |
| `SEALED_SECRETS_NAMESPACE` | variable | controller namespace, default `sealed-secrets`; never `kube-system` |

The cluster identity lists the Secrets of the controller namespace and
nothing else. Create it once per cluster with an admin kubeconfig, and pipe
its kubeconfig straight into the secret (it is never written to disk):

```bash
bash scripts/sealed-secrets-backup-identity.sh \
  | gh secret set SEALED_SECRETS_BACKUP_KUBECONFIG --env sealed-secrets-key-backup
# API server address reachable from the GitHub runners, if the context's is not:
bash scripts/sealed-secrets-backup-identity.sh --server https://api.example.net:6443 | gh secret set ...
# Rotation (suspected leak, departure): the old token stops working
bash scripts/sealed-secrets-backup-identity.sh --rotate \
  | gh secret set SEALED_SECRETS_BACKUP_KUBECONFIG --env sealed-secrets-key-backup
```

The script applies, in the controller namespace, the ServiceAccount
`sealed-secrets-key-backup`, a Role with `list` on `secrets` only, its
RoleBinding and the token Secret `sealed-secrets-key-backup-token`. RBAC
cannot filter by label: the identity can list **every** Secret of the
controller namespace. In `sealed-secrets` that is the controller keys and its
own token, nothing else (the kind drill lists what the identity reads and
fails on anything more). The script refuses `kube-system`: on k3s, the
target cluster ([ENCRYPTION_AT_REST.md](ENCRYPTION_AT_REST.md)),
`kube-system` also holds `k3s-serving` (private key of the API server
serving certificate), the `<node>.node-password.k3s` Secrets (node
registration passwords) and the Secrets of the bundled Helm charts, all of
which the identity would read.

Treat a leak of `SEALED_SECRETS_BACKUP_KUBECONFIG` as a leak of the
controller keys, and so of every SealedSecret of the repository:

1. `bash scripts/sealed-secrets-backup-identity.sh --rotate | gh secret set ...`:
   the leaked token stops working;
2. renew the controller keys and reseal every secret with **new values**
   ([Key rotation](#key-rotation), `scripts/rotate-secrets.sh`): a reseal
   alone keeps values the attacker could already decrypt;
3. back up the new keys (`gh workflow run sealed-secrets-key-backup.yml`).

Nothing else of the cluster needs rotating, as long as `sealed-secrets` holds
only the controller. Check it with `kubectl -n sealed-secrets get secret`:
the keys and `sealed-secrets-key-backup-token` only.

The job writes the kubeconfig to a tmpfs (mode 600) and deletes it after
the run. A missing secret or variable, an unreachable API server (it must be
reachable from GitHub-hosted runners, as for `deploy.yml`) or bucket, no key
found, age or the copy failing: the run fails and GitHub notifies on it. Its
summary lists the keys found and the file written. A new cluster (total
outage) has no identity yet: the run fails until the identity is created
again and the secret updated.

The bucket's Object Lock keeps each file at least 30 days; no lifecycle rule
expires `sealed-secrets-key/`, and the newest file always holds every key.

## Restore the controller keys in a new cluster

Step of the total outage recovery ([BACKUP_DR.md](BACKUP_DR.md#recovery-steps-for-total-outage)),
before the manifests are deployed. It needs an age private key of the
backups (operator key, or the escrow key from the safe):

```bash
export BACKUP_S3_BUCKET=s3://bucket/prefix AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=...
bash scripts/restore-sealed-secrets-key.sh --identity ~/backup-key.txt              # newest backup
bash scripts/restore-sealed-secrets-key.sh --identity ~/backup-key.txt --timestamp 2026-11-03_120000
bash scripts/restore-sealed-secrets-key.sh --identity ~/backup-key.txt --file sealed-secrets-key_<TS>.yaml.age
# then install the controller (bash scripts/install-sealed-secrets.sh), or nothing more if it already runs
bash scripts/backup-sealed-secrets-key.sh                                        # back up the new cluster's keys
bash scripts/sealed-secrets-backup-identity.sh \
  | gh secret set SEALED_SECRETS_BACKUP_KUBECONFIG --env sealed-secrets-key-backup   # daily backup again
```

The file is decrypted once before anything is applied (a wrong key or a
corrupt file changes nothing), then straight into `kubectl apply`. Run it
before installing the controller: it then starts with the restored keys. If
the controller already runs, the script restarts it
(`SEALED_SECRETS_CONTROLLER`, default `sealed-secrets-controller`), since it
reads its keys at startup only; a controller started before the restore
created a key of its own, hence the backup afterwards. Exit 1 when no file is
found, it does not decrypt, the keys are not found after the apply, or the
controller does not restart.

`tests/k8s/sealed-secrets-key-drill.sh` proves the loop on kind (job
`sealed-secrets-key` of `backup-test.yml`): a secret sealed in one cluster,
the identity of the daily workflow created and its rights checked
(`kubectl auth can-i`: list Secrets of `sealed-secrets` only, nothing in
`kube-system`; what it reads: the keys and its own token, nothing else), keys backed up
to S3 with that identity, the cluster deleted, a new cluster with a new
controller that does not decrypt the SealedSecret, the keys restored, the
SealedSecret decrypted to the original value.

## Key rotation

The controller creates a new key every 30 days (`--key-renew-period`), or at
startup once `--key-cutoff-time` has passed; it keeps the old keys to decrypt
what they sealed. `kubeseal --rotate` (alias of `--re-encrypt`) reseals an
existing SealedSecret with the newest key, so that it no longer depends on an
older one:

```bash
kubeseal --controller-namespace sealed-secrets --rotate -o yaml < deploy/k8s/secrets/trading-model-sealed-secrets.yaml > /tmp/resealed.yaml
mv /tmp/resealed.yaml deploy/k8s/secrets/trading-model-sealed-secrets.yaml
bash scripts/backup-sealed-secrets-key.sh   # back up the keys after every key change
```

## Move the controller out of kube-system

A cluster where the controller was installed with the upstream
`controller.yaml` runs it in `kube-system`. Move it to `sealed-secrets`
(ADR-0035) with its keys, so that every SealedSecret keeps decrypting, then
remove what is left in `kube-system`. Use an admin kubeconfig and the
backup environment variables (bucket, recipients, as in
[Back up the controller keys](#back-up-the-controller-keys)).

```bash
# 1. Off-site copy of the keys of kube-system, before anything changes
SEALED_SECRETS_NAMESPACE=kube-system bash scripts/backup-sealed-secrets-key.sh
# 2. Put them in the new namespace, before the new controller starts
bash scripts/restore-sealed-secrets-key.sh --identity ~/backup-key.txt
# 3. Install the controller in sealed-secrets: it starts with the same keys.
#    The ClusterRoleBinding now names the new ServiceAccount: the old
#    controller loses its rights and stops unsealing.
bash scripts/install-sealed-secrets.sh
# 4. Remove the old controller's NAMESPACED objects only. Never
#    `kubectl delete -f controller.yaml`: it deletes the CRD, hence every
#    SealedSecret and, through their owner references, every Secret they made.
kubectl -n kube-system delete deployment,service,serviceaccount sealed-secrets-controller
kubectl -n kube-system delete service sealed-secrets-controller-metrics
kubectl -n kube-system delete role,rolebinding sealed-secrets-key-admin sealed-secrets-service-proxier --ignore-not-found
kubectl -n kube-system delete rolebinding sealed-secrets-controller --ignore-not-found
kubectl -n kube-system delete secret -l sealedsecrets.bitnami.com/sealed-secrets-key
# 5. Old backup identity, if one was created in kube-system
kubectl -n kube-system delete serviceaccount,role,rolebinding sealed-secrets-key-backup --ignore-not-found
kubectl -n kube-system delete secret sealed-secrets-key-backup-token --ignore-not-found
# 6. New identity, then a backup from the new namespace
bash scripts/sealed-secrets-backup-identity.sh \
  | gh secret set SEALED_SECRETS_BACKUP_KUBECONFIG --env sealed-secrets-key-backup
gh workflow run sealed-secrets-key-backup.yml
```

Before step 4, check that `kubectl -n trading-model get secret` still lists
the decrypted secrets and that
`kubeseal --controller-namespace sealed-secrets --fetch-cert` answers. A
kubeconfig of an identity in `kube-system`, if one was ever stored in GitHub,
could read every Secret of `kube-system`: step 5 revokes it. If it may have
leaked, also rotate the k3s serving certificate and the node passwords (k3s
documentation), on top of the controller keys.

## Migration from plaintext Kustomize

The original `kustomization.yaml` with plaintext `literals` is replaced by the `trading-model-sealed-secrets.yaml` SealedSecret resource. Remove the `secretGenerator` with `literals` from `kustomization.yaml` once you have encrypted your secrets.
