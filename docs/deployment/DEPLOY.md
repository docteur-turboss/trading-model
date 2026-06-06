# Deployment

## Local deployment (development)

Start all services:

```bash
docker compose up -d
```

Follow logs:

```bash
docker compose logs -f
```

Stop:

```bash
docker compose down
```

Stop **and delete volumes** (data loss):

```bash
docker compose down -v
```

---

## Fleet deployment (beta)

A canary deployment script reads inventory from `scripts/hosts.json`.

### PowerShell (Windows)

```powershell
.\scripts\deploy-beta.ps1                              # canary 2%
.\scripts\deploy-beta.ps1 -CanaryPercent 5              # canary 5%
.\scripts\deploy-beta.ps1 -Branch feat/foo              # custom branch
.\scripts\deploy-beta.ps1 -ForceRollback                # rollback to main
.\scripts\deploy-beta.ps1 -SkipCanary                   # full deployment direct
```

### Bash (Linux / macOS / CI)

```bash
bash scripts/deploy-beta.sh                             # canary 2%
bash scripts/deploy-beta.sh --canary 5                  # canary 5%
bash scripts/deploy-beta.sh --branch feat/foo            # custom branch
bash scripts/deploy-beta.sh --rollback                   # rollback to main
bash scripts/deploy-beta.sh --skip-canary                # full deployment direct
bash scripts/deploy-beta.sh --hosts ./hosts.json         # custom inventory
```

### Deployment phases

```
Phase 1 : Canary deployment (2% of hosts by default)
   │
   ▼ (failure → rollback)
Phase 2 : Health check (up to 3 retries, 10s interval)
   │
   ▼ (failure → rollback)
Phase 3 : Monitoring (30 min, 5% error threshold)
   │
   ▼ (threshold exceeded → rollback)
Phase 4 : Full deployment (remaining 98%)
```

Each host executes:

```bash
git fetch origin
git checkout <branch>
git pull origin <branch>
IMAGE_TAG=<tag> docker compose pull
IMAGE_TAG=<tag> docker compose up -d
```

### Host inventory (`scripts/hosts.json`)

```json
{
  "hosts": [
    {
      "host": "192.168.47.131",
      "user": "trading",
      "label": "Beta Server 1",
      "active": true
    }
  ],
  "deploy": {
    "canary_percent": 2,
    "error_threshold": 0.05,
    "health_check_retries": 3,
    "health_check_interval_sec": 10,
    "monitor_duration_min": 30,
    "branch_dev": "development",
    "branch_stable": "main",
    "image_tag_dev": "latest",
    "image_tag_stable": "latest",
    "services": ["discovery-server", "message-manager", "financial-scraper", "trader-trainer"],
    "health_endpoints": {
      "discovery-server": "https://localhost:8443/ping",
      "message-manager": "https://localhost:8444/health",
      "financial-scraper": "https://localhost:8445/health",
      "trader-trainer": "https://localhost:8446/training-status"
    }
  }
}
```

---

## Add a new host to the deployment fleet

Once the server is operational (see [SETUP.md](SETUP.md)), add it to the inventory so the automated deployment script can reach it.

Edit `scripts/hosts.json` on your deployment machine:

```json
{
  "hosts": [
    {
      "host": "192.168.1.100",
      "user": "trading",
      "label": "Beta Server 1",
      "active": true
    },
    {
      "host": "192.168.1.101",
      "user": "trading",
      "label": "Beta Server 2 (new)",
      "active": true
    }
  ],
  "deploy": {
    "canary_percent": 2,
    "error_threshold": 0.05,
    "health_check_retries": 3,
    "health_check_interval_sec": 10,
    "monitor_duration_min": 30,
    "branch_dev": "development",
    "branch_stable": "main",
    "image_tag_dev": "latest",
    "services": ["discovery-server", "message-manager", "financial-scraper", "trader-trainer"],
    "health_endpoints": {
      "discovery-server": "https://localhost:8443/ping",
      "message-manager": "https://localhost:8444/health",
      "financial-scraper": "https://localhost:8445/health",
      "trader-trainer": "https://localhost:8446/health"
    }
  }
}
```

---

## Automated deployment (SSH)

For `deploy-beta.sh` to run remote commands, the deployment machine must be able to connect via SSH without a password.

### From the deployment machine

```bash
ssh-keygen -t ed25519 -C "deploy@trading-model"
ssh-copy-id trading@<NEW_SERVER>
```

### Verify the connection

```bash
ssh trading@<NEW_SERVER> "docker compose ps"
```

### Deploy to the new server

```bash
# Full deployment
bash scripts/deploy-beta.sh --hosts ./scripts/hosts.json

# Or canary deployment (only X% of hosts)
bash scripts/deploy-beta.sh --canary 10

# Rollback if needed
bash scripts/deploy-beta.sh --rollback
```

---

## Production deployment

1. A tag `v*.*.*` is pushed on `main`
2. `release.yml` builds and publishes images to `ghcr.io`
3. An operator manually pulls the new images on the fleet:

```bash
git pull --tags
git checkout v$(node -p "require('./package.json').version")
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose pull
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose up -d
```

---

## Rollback

Revert to a previous version:

```bash
docker compose pull <service>:<previous-version>
docker compose up -d
```

In beta, rollback is automatic on failure. For manual rollback:

```bash
# PowerShell
.\scripts\deploy-beta.ps1 -ForceRollback

# Bash
bash scripts/deploy-beta.sh --rollback
```

Rollback replaces the branch with `main` (stable) and the image tag with `latest` on all active hosts.
