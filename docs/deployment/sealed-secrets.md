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
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.1/controller.yaml
```

### 2. Encrypt your production secrets

```bash
# Create a temporary plaintext secret file (NOT committed to git)
kubectl create secret generic trading-model-secrets \
  --namespace trading-model \
  --from-literal=AUTH_TOKENS='your-real-tokens' \
  --from-literal=SIGNING_SECRET='your-signing-secret' \
  --from-literal=MYSQL_ROOT_PASSWORD='your-mysql-root-password' \
  --from-literal=MYSQL_PASSWORD='your-mysql-password' \
  --from-literal=DLQ_AUTH_HMAC_SECRET='your-dlq-hmac-secret' \
  --from-literal=GRAFANA_PASSWORD='your-grafana-password' \
  --from-literal=HMAC_SECRET='your-hmac-secret' \
  --dry-run=client -o yaml > /tmp/plaintext-secret.yaml

# Seal it (requires kubeseal CLI)
kubeseal -o yaml < /tmp/plaintext-secret.yaml > deploy/k8s/secrets/trading-model-sealed-secrets.yaml

# Clean up
rm /tmp/plaintext-secret.yaml
```

### 3. Apply

```bash
kubectl apply -f deploy/k8s/secrets/trading-model-sealed-secrets.yaml
```

## Back up the controller keys

The SealedSecrets of `deploy/k8s/secrets/` decrypt only with the private keys
of the controller that sealed them. They live in the cluster only: Secrets
labelled `sealedsecrets.bitnami.com/sealed-secrets-key` in the controller
namespace (`kube-system`). Lose the cluster without a copy of them and no
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
Secrets of `kube-system`:

```bash
# Same recipients and bucket as production (GitHub environment `production`)
export BACKUP_AGE_RECIPIENTS="age1...operator age1...escrow" BACKUP_MIN_RECIPIENTS=2
export BACKUP_S3_BUCKET=s3://bucket/prefix AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=...
export RCLONE_S3_ENDPOINT=https://s3.example.net RCLONE_S3_PROVIDER=Other   # non-AWS store only
bash scripts/backup-sealed-secrets-key.sh
bash scripts/backup-sealed-secrets-key.sh --dest /media/usb   # also keep the encrypted file
```

Exit 1, with nothing written, when no key Secret is found
(`SEALED_SECRETS_NAMESPACE`, default `kube-system`), or when kubectl, age or
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
`kubectl -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key`:
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
| `SEALED_SECRETS_NAMESPACE` | variable | controller namespace, default `kube-system` |

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
cannot filter by label: the identity can list **every** Secret of
`kube-system`. Treat a leak of `SEALED_SECRETS_BACKUP_KUBECONFIG` as a leak
of the controller keys: `--rotate`, then renew the keys and reseal every
secret ([Key rotation](#key-rotation)).

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
# then install the controller (Setup, step 1), or nothing more if it already runs
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
(`kubectl auth can-i`: list Secrets of `kube-system` only), keys backed up
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
kubeseal --rotate -o yaml < deploy/k8s/secrets/trading-model-sealed-secrets.yaml > /tmp/resealed.yaml
mv /tmp/resealed.yaml deploy/k8s/secrets/trading-model-sealed-secrets.yaml
bash scripts/backup-sealed-secrets-key.sh   # back up the keys after every key change
```

## Migration from plaintext Kustomize

The original `kustomization.yaml` with plaintext `literals` is replaced by the `trading-model-sealed-secrets.yaml` SealedSecret resource. Remove the `secretGenerator` with `literals` from `kustomization.yaml` once you have encrypted your secrets.
