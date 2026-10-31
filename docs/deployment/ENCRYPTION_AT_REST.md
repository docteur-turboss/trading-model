# Encryption at Rest

The platform runs on self-hosted machines (VPS, home PCs) with community
editions only: no MySQL Enterprise TDE, no MongoDB Enterprise. Data at rest is
protected at two levels:

| Layer | Covers | Tooling |
| --- | --- | --- |
| **Data disk** (LUKS2 + Clevis/Tang) | Everything a host stores: MySQL, MongoDB, Redis, Loki, Prometheus, SPIRE keys and datastore, K8s Secrets (k3s datastore), the in-cluster backup volume | `deploy/host/` |
| **Backups** (age) | Every dump, from the moment it is written: in the cluster and off-site | `scripts/backup-lib.sh`, image `backup-tools` |

## Threat model

| Threat | Protected |
| --- | --- |
| Disk or machine stolen, disk resold or recycled | Yes |
| Hosting provider reading a disk image or a snapshot | Yes (the key is never on the disk) |
| Backup bucket leaked or provider compromised | Yes (age: only the private key, kept off the cluster, decrypts) |
| Attacker with root on a running host | **No**: the volume is open, as with any at-rest encryption |
| Memory dump of a running VPS by the provider | **No**: a provider controlling the hypervisor can read RAM |

## 1. Data disks: LUKS2 + Clevis/Tang

Each data host keeps the stack's data on a dedicated disk (or partition)
encrypted with LUKS2 (AES-XTS 512, argon2id). A passphrase typed at each
reboot is impractical for VPS, so **Clevis** unlocks the disk automatically
when one of these is available:

- a **Tang** server: a tiny stateless HTTP service (under 64 MB of RAM) that
  holds no client secret. The disk unlocks only when the host can reach it, so
  a disk image taken out of the network stays sealed;
- the host's **TPM2** chip (home PCs): the disk unlocks only in that machine.

Placement on the available resources:

```
 VPS A (k3s / compose)  ──┐                  ┌── Tang server: the cheapest VPS,
 VPS B (k3s agent)      ──┼─ WireGuard/fw ───┤   a Raspberry Pi or a home PC
 Home PC (TPM2 + Tang)  ──┘                  └── (2 Tang servers = no single point)
```

Rules:

- **Never put Tang on the host it unlocks**: whoever takes that disk would also
  hold the key.
- Two Tang servers on two different machines (`--tang` twice, threshold 1)
  avoid losing every reboot to one Tang outage.
- With `--tpm2 --tang URL --threshold 2`, a home PC unlocks only when it is
  both the same machine and on the expected network.
- Expose Tang only to the data hosts (firewall or WireGuard): it is not a
  secret store, but there is no reason to publish it.

### Install a Tang server

On the Tang machine (Debian, Ubuntu, Raspberry Pi OS):

```bash
sudo deploy/host/tang-server.sh --port 7500
# Tang listens on :7500
# thumbprint: QVXB2tF7DqHC4DgeQG1Cwd9O8fcD5OtU9JhGzQ3SJKo
```

Note the thumbprint: data hosts pin it so they never trust another key.

### Encrypt a data host's disk

On each data host, with a **dedicated empty disk** (an extra VPS block volume,
a second SSD). `--device` is erased:

```bash
sudo apt-get install cryptsetup clevis clevis-luks clevis-systemd clevis-tpm2 curl jose rsync

# k3s: PVs (local-path), the datastore with the Secrets, images
sudo deploy/host/encrypt-data-disk.sh --device /dev/sdb --mount /var/lib/rancher \
  --tang 'http://10.8.0.1:7500#QVXB2tF7DqHC4DgeQG1Cwd9O8fcD5OtU9JhGzQ3SJKo' \
  --tang 'http://10.8.0.2:7500#<thumbprint 2>' \
  --service k3s --migrate --wipe

# compose: named volumes
sudo deploy/host/encrypt-data-disk.sh --device /dev/sdb --mount /var/lib/docker \
  --tang 'http://10.8.0.1:7500#<thumbprint>' --service docker --migrate --wipe
```

The script:

1. checks everything before touching the disk: Tang reachable and its
   thumbprint valid, mount point not on the target disk, `--wipe` given;
2. formats the disk with LUKS2 and a random **recovery passphrase**
   (`/root/luks-recovery-tmdata.key`);
3. binds Clevis (`sss` policy: the Tang servers and/or the TPM2, threshold);
4. **proves the boot path**: opens the volume through Clevis alone (no
   passphrase) before creating the filesystem;
5. with `--migrate`, stops the services and copies the existing data onto the
   encrypted disk, keeping the original as `<mount>.pre-encryption-<date>`;
6. writes `/etc/crypttab` (`luks,_netdev`: unlocked once the network is up)
   and `/etc/fstab` (`nofail`: a failed unlock does not block the boot, SSH
   stays reachable), enables `clevis-luks-askpass.path`, and adds
   `RequiresMountsFor=` to each `--service`: k3s or docker never starts on an
   empty directory.

Afterwards:

- **Move the recovery passphrase off the machine** (password manager, paper)
  and delete it from `/root`. It is the only way in if every Tang server is
  lost.
- Delete `<mount>.pre-encryption-<date>` once the services run: that copy is
  **in clear**. On an SSD, the blocks it freed may survive deletion: when the
  previous data was sensitive, prefer a fresh install with the encrypted disk
  from the start.
- Disable swap, or put it on the encrypted disk (`swapoff -a`, remove it from
  `/etc/fstab`): k3s/kubelet expects no swap anyway.
- For k3s, also enable Secrets encryption in its datastore:
  `--secrets-encryption` at install (free, built into k3s).

### Check

```bash
sudo deploy/host/check-encryption.sh            # /var/lib/rancher, /var/lib/docker
OK        /var/lib/rancher on /dev/mapper/tmdata
          clevis 1: sss '{"t":1,"pins":{"tang":[{"url":"http://10.8.0.1:7500"}]}}'
```

Exit status 1 when a data directory or the swap is in clear: usable as a
periodic check.

### Operations

| Task | Command |
| --- | --- |
| Rotate Tang keys (yearly) | on Tang: `/usr/libexec/tangd-rotate-keys -d /var/lib/tang`; on each host: `clevis luks regen -d /dev/sdb -s 1`; then remove the old keys (renamed `.*.jwk`) from Tang |
| Add a Tang server | `clevis luks bind -d /dev/sdb sss '<new policy>'`, then `clevis luks unbind -d /dev/sdb -s <old slot>` |
| Unlock by hand (every Tang down) | `cryptsetup open /dev/sdb tmdata` with the recovery passphrase, `mount /var/lib/rancher`, start the services |
| Inspect bindings | `clevis luks list -d /dev/sdb` |

Tested: the scripts were run against a Tang server and a loop device in a
privileged container (wrong thumbprint refused before erasing, migration,
Clevis-only unlock after closing, unlock refused when Tang is down, recovery
passphrase). The boot integration (`crypttab`, `clevis-luks-askpass`) needs a
real host: reboot once after setting it up and check that the services start.

### Alternative: Longhorn (multi-node k3s)

On a k3s cluster of 3+ nodes, Longhorn's encrypted StorageClass (LUKS per
volume, key in a K8s Secret) replaces the per-host disk and adds replication
between nodes, at about 0.5–1 vCPU and 1–2 GB RAM per node. The Tang setup
above remains the lighter choice for one or two hosts.

## 2. Backups: age

Every backup file is piped through [age](https://age-encryption.org) while it
is written (`scripts/backup-lib.sh`): no plaintext dump ever reaches a disk,
neither the in-cluster `backup-data` volume nor the off-site bucket. Files get
the `.age` suffix. Only the **public** key is configured; the private key
never enters the cluster.

### Keys

```bash
age-keygen -o backup-key.txt     # private key: password manager / offline
# Public key: age1...            # goes to the cluster
```

Several recipients are allowed (space separated), e.g. an operator key plus a
key kept in a safe: either decrypts.

### Kubernetes

- Set the GitHub environment variable `BACKUP_AGE_RECIPIENTS` (Settings →
  Environments → staging/production → Variables). `deploy.yml` writes it into
  the `backup-encryption` ConfigMap.
- The `db-backup` CronJob runs `ghcr.io/trading-model/backup-tools`
  (`deploy/backup`: kubectl, age, rclone) with
  `BACKUP_REQUIRE_ENCRYPTION=true`: without a recipient it writes nothing,
  exits 1 and exports `backup_last_status{component="encryption"} 0`
  (alert `BackupUnencrypted`).
- Off-site copy (mandatory, `BACKUP_REQUIRE_OFFSITE=true`: the job fails
  without it): secret `trading-model-backup-s3` (`BACKUP_S3_BUCKET`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, optional
  `S3_ENDPOINT` and `S3_PROVIDER` for a non-AWS store: MinIO on another VPS,
  Backblaze B2, Scaleway, OVH...), written by `deploy.yml` from the GitHub
  environment (see [BACKUP_DR.md](BACKUP_DR.md#off-site-storage-mandatory-in-kubernetes))
  or created by hand. Only `.age` files are sent; the scripts refuse to copy
  anything when encryption is off. Retention off-site is the bucket's
  lifecycle rule.

```bash
kubectl -n trading-model create secret generic trading-model-backup-s3 \
  --from-literal=BACKUP_S3_BUCKET=s3://backups/trading-model \
  --from-literal=AWS_ACCESS_KEY_ID=... --from-literal=AWS_SECRET_ACCESS_KEY=... \
  --from-literal=AWS_REGION=us-east-1 \
  --from-literal=S3_ENDPOINT=https://minio.example.net --from-literal=S3_PROVIDER=Minio
```

### Docker Compose

```bash
BACKUP_AGE_RECIPIENTS=age1... BACKUP_REQUIRE_ENCRYPTION=true bash scripts/backup.sh
```

Without `BACKUP_AGE_RECIPIENTS` the compose script still writes plaintext
backups (local development) and warns.

### Restore

```bash
BACKUP_AGE_IDENTITY=~/backup-key.txt bash scripts/restore.sh --timestamp 2026-10-27_020000
BACKUP_AGE_IDENTITY=~/backup-key.txt BACKUP_DIR=./backups bash scripts/restore-k8s.sh
```

The restore scripts accept encrypted and plaintext files alike and stream the
decrypted data into the database (the plaintext only touches a temporary
file, mode 600, for Redis and the SPIRE files, which need a file copy). Manual decryption:

```bash
age -d -i backup-key.txt financial_scraper_<date>.sql.gz.age | gunzip | less
```

### Monitoring

| Metric | Meaning |
| --- | --- |
| `backup_encrypted` | 1 when the last run encrypted its files |
| `backup_last_status{component="encryption"}` | 0: no valid recipient, nothing was written |
| `backup_last_status{component="offsite"}` | off-site copy result |

Alerts: `BackupUnencrypted` and `BackupOffsiteCopyFailed` (critical), plus
the staleness and coverage alerts listed in [BACKUP_DR.md](BACKUP_DR.md#monitoring).

### Tests

- `tests/backup/backup-encryption.test.sh` (`backup-test.yml`): age round
  trip, refusal without recipient, invalid key, no off-site copy in clear or
  missing, GTID filtering, metrics, restore scripts finding `.age` files.
- Restore drills, with a key generated for the run: `backup-test.yml`
  (`tests/backup/compose-restore-drill.sh`) and the CI `k8s` job
  (`tests/k8s/run-kind.sh verify_backup`): no backup file in clear, encrypted
  copies off-site, and the decrypted backups restored for real.

## Why not database-native encryption

- **MySQL 8.4 Community** has `component_keyring_file` (InnoDB tablespace,
  redo/undo, binlog encryption), but the keyring file must sit on a different
  volume from the data, or it protects nothing; on one host, the encrypted disk
  already covers it.
- **MongoDB Community** has no encryption at rest; Percona Server for MongoDB
  (free, drop-in) restores `--enableEncryption --encryptionKeyFile` if a
  compliance requirement asks for database-level encryption (its key file
  holds 32 random bytes in base64: a new Secret to create then, no Mongo key
  is provisioned today).

Both stay possible as an extra layer; the disk + backup layers above cover the
threats of a self-hosted deployment without changing database editions.
