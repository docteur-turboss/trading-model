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
It runs from an operator workstation with a kubeconfig that can read the
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

**Run it again after every key change**, or the keys created since the last
backup are lost with the cluster, and so are the secrets sealed with them:

- after every `kubeseal --rotate` and every manual key renewal (see
  [Key rotation](#key-rotation));
- after every automatic key renewal: the controller creates a new key every
  30 days by default (`--key-renew-period`). List the keys and their dates
  with `kubectl -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key`:
  a key newer than the newest `sealed-secrets-key_<TIMESTAMP>.yaml.age` of
  the bucket is not backed up;
- after the controller is installed or reinstalled on a cluster, and after
  a restore (below);
- before sealing a new secret with `kubeseal` or `scripts/init-sealed-secrets.sh`.

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
keys backed up to S3, the cluster deleted, a new cluster with a new
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
