# Compose secrets (age)

`deploy/compose/secrets.env.age`: the `.env` of the compose stack (keys of `.env.example`), encrypted with age for two recipients, the host and the operator. It is part of the release tag: `deploy-compose.yml` decrypts it in a tmpfs, refuses the version before any change if it does not decrypt or lacks a `${VAR:?}` key (`scripts/compose-secrets.sh`, test `tests/backup/compose-secrets.test.sh`), and removes it at the end, failure included. Without the file, the workflow still reads `COMPOSE_ENV_FILE`.

## Install the host key (once)

1. `age-keygen -o /path/in/docker-vm/compose.age` (a volume inside the Docker VM, never on `C:`, mode 600). Set the environment variable `COMPOSE_AGE_IDENTITY_FILE` to that path. `age` must be on the runner.
2. The operator makes their own key; keep it with the other age keys (`backup-age-keys`).

## Create, edit, rotate

```bash
# first time: values copied unchanged from the host .env (a changed MySQL/Mongo value locks the existing volumes)
age -r <host-pub> -r <operator-pub> -o deploy/compose/secrets.env.age .env
# edit
age -d -i operator.key deploy/compose/secrets.env.age > /tmp/s.env && "$EDITOR" /tmp/s.env \
  && age -r <host-pub> -r <operator-pub> -o deploy/compose/secrets.env.age /tmp/s.env; shred -u /tmp/s.env
```

Add or remove a recipient: same re-encryption with the new `-r` list. Then PR, release, `deploy-compose.yml` with the new tag. Delete the host `.env` (and unset `COMPOSE_ENV_FILE`) after the first successful deploy.

MySQL and Mongo users keep their old password in the volume: change the value in the database first (`db-migrate-user`, `deploy/mongo/users.js`, as on K8s), then in the file.

## Accepted risks (public repository)

- The file and its history stay readable forever. A leak of either age key exposes every past and present value: rotate **all** values and make a new key pair.
- One key pair for this environment only, never shared with backups or K8s; no value reused elsewhere.
- The file shows key names and rotation dates: no sensitive value in a name.
- Secrets still reach containers as environment variables (`*_FILE` is out of scope).
