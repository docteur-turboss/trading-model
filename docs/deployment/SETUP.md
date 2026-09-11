# Setup Guide — Local Dev & Production Fleet

## Prerequisites

| Tool                           | Version    | Usage                      |
| ------------------------------ | ---------- | -------------------------- |
| Bun                           | 1.3+       | JS runtime + package manager |
| Docker Desktop / Docker Engine | 24+        | Containerization           |
| Git                            | 2.40+      | Version control            |

Verify installed versions:

```bash
bun --version      # ≥ 1.3.x
docker --version   # ≥ 24.x
git --version      # ≥ 2.40
```

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/trading-model/trading-model.git
cd trading-model
```

### 2. Install dependencies

```bash
bun install --frozen-lockfile
```

`bun install --frozen-lockfile` uses the lockfile (`bun.lock`) for a deterministic and reproducible installation.

### 3. Build shared packages

```bash
bun run build
```

Compiles the monorepo packages in this order:

1. `common` (`packages/common`)
2. `validation` (`packages/validation`) + `server-utils` (`packages/server-utils`)
3. `crypto` (`packages/crypto`)
4. `address-manager` (`packages/address-manager`)
5. `broker-message` (`packages/broker-message`)

Packages are used by the microservices as `@trading-model/*` workspace dependencies.

### 4. mTLS via SPIRE (automatic)

No certificate generation is required. mTLS identities are issued by SPIRE
(ADR-0011): `spiffe-helper` sidecars write each service SVID into
`/run/spire/svid` (`svid.pem`, `svid_key.pem`, `bundle.pem`), which the services
use via `TLS_KEY_PATH` / `TLS_CERT_PATH` / `TLS_CA_PATH`. There is no `./certs`
bundle to create or mount.

> **Never commit certificates.** SVIDs live in compose/K8s volumes and are
> never checked in.

### 5. Configure environment

```bash
cp .env.example .env
```

Default values in `docker-compose.yml` are sufficient for first startup. Change passwords in production.

### 6. Build Docker images

```bash
docker compose build
```

Or a single service:

```bash
docker compose build discovery-server
```

### 7. Start services

```bash
docker compose up -d
```

First run downloads database images (MongoDB 7, MySQL 8) and builds service images — expect 1–3 minutes.

### 8. Verify

```bash
docker compose ps
```

All containers should show `Up` or `healthy`:

```
trading-mongo      Up (healthy)
trading-mysql      Up (healthy)
trading-discovery  Up (healthy)
trading-message    Up (healthy)
trading-scraper    Up (healthy)
trading-trainer    Up (healthy)
trading-gateway    Up (healthy)
trading-audit      Up (healthy)
trading-admin      Up (healthy)
```

```bash
# Verify core services
curl -sk https://localhost:8443/ping     # discovery-server
curl -sk https://localhost:8444/ping     # message-manager
curl -sk https://localhost:8445/ping     # financial-scraper
curl -sk https://localhost:8446/ping     # trader-trainer
curl -sk https://localhost:8448/ping     # api-gateway
curl -sk https://localhost:8450/ping     # audit-logger

# Admin interface (HTTP)
curl http://localhost:8449/

# List registered services
curl -sk https://localhost:8443/services | jq .

# Real-time logs
docker compose logs -f
```

### 9. Run tests

```bash
bun run test
```

### 10. Stop

```bash
docker compose down       # stop, keep database data
docker compose down -v    # stop and delete database data
```

---

## Production Fleet Setup (bare-metal Linux server)

Complete procedure to add a bare Linux server to the Trading Model fleet, from OS to running containers.

### 1. Operating System Installation

**Recommended:** Ubuntu Server 24.04 LTS (minimal)

| Resource | Minimum       | Recommended      |
| -------- | ------------- | ---------------- |
| CPU      | 2 cores       | 4+ cores         |
| RAM      | 4 GB          | 8+ GB            |
| Storage  | 20 GB         | 50+ GB (SSD)     |
| OS       | Ubuntu 22.04+ | Ubuntu 24.04 LTS |

1. Download ISO from [ubuntu.com/download/server](https://ubuntu.com/download/server)
2. Create bootable USB (Rufus on Windows, `dd` on Linux)
3. Install:
   - Choose **Ubuntu Server** (not Desktop)
   - Configure a **static IP**
   - Check **Install OpenSSH server**
   - Create an admin user (e.g. `trading`)
4. Reboot and verify SSH access:
   ```bash
   ssh trading@<SERVER_IP>
   ```

### 2. System Configuration

#### 2.1 Hostname

```bash
sudo hostnamectl set-hostname trading-<role>-<number>
# Examples:
#   trading-discovery-1
#   trading-scraper-2
#   trading-trainer-3
```

Add to `/etc/hosts`:

```bash
echo "127.0.1.1 $(hostname)" | sudo tee -a /etc/hosts
```

#### 2.2 Static IP

Edit `/etc/netplan/00-installer-config.yaml`:

```yaml
network:
  ethernets:
    ens33:
      dhcp4: no
      dhcp6: no
      addresses:
        - 192.168.47.100/24
      routes:
        - to: default
          via: 192.168.47.2
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
      match:
        macaddress: 00:0c:29:05:19:a4
      set-name: ens33
  version: 2
```

Apply:

```bash
sudo netplan apply
```

**Known VMware issues:** If the VM loses internet after applying:

- Wrong gateway: check VMware Virtual Network Editor → NAT Settings
- Windows Firewall: add inbound rule for VMnet8
- VMware NAT Service stalled: restart as Administrator: `Restart-Service "VMware NAT Service"`

#### 2.3 Swap (recommended if < 8 GB RAM)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### 2.4 Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8443/tcp  # Discovery Server
sudo ufw allow 8444/tcp  # Message Manager
sudo ufw allow 8445/tcp  # Financial Scraper
sudo ufw allow 8446/tcp  # Trader Trainer
sudo ufw enable
sudo ufw status verbose
```

#### 2.5 Timezone

```bash
sudo timedatectl set-timezone Europe/Paris
```

### 3. Dependency Installation

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git openssl jq bc ufw htop net-tools
```

#### Docker

```bash
# Check if Docker is already installed
if command -v docker &> /dev/null; then
    echo "Docker already installed: $(docker --version)"
else
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-v2
fi
```

Add user to docker group:

```bash
sudo usermod -aG docker $USER
# Log out and back in
```

Verify:

```bash
docker --version
docker compose version
docker run hello-world
```

#### Bun (optional — for local builds)

```bash
if command -v bun &> /dev/null; then
    echo "Bun already installed: $(bun --version)"
else
    curl -fsSL https://bun.sh/install | bash
fi
bun --version
```

### 4. mTLS via SPIRE

The project uses **mTLS** for all inter-service communication, with identities
issued automatically by **SPIRE** (ADR-0011). Each workload's `spiffe-helper`
sidecar fetches an SVID and writes it to `/run/spire/svid`. No per-host
certificate generation or `./certs` bundle is required.

### 5. Project Checkout

```bash
cd ~
git clone https://github.com/trading-model/trading-model.git
cd trading-model

# Install bun dependencies (try clean install, fall back to install)
bun install --frozen-lockfile 2>/dev/null || { echo "bun install --frozen-lockfile failed — falling back to bun install"; bun install; }

# TypeScript build (only needed for local image builds)
bun run build
```

### 6. Environment Configuration

```bash
cp .env.example .env
```

Customize per server role:

| Variable              | Description                                   |
| --------------------- | --------------------------------------------- |
| `NODE_ENV`            | `production` (or `development` for debugging) |
| `DISCOVERY_PORT`      | 8443 — Discovery Server                       |
| `MESSAGE_PORT`        | 8444 — Message Manager                        |
| `SCRAPER_PORT`        | 8445 — Financial Scraper                      |
| `TRAINER_PORT`        | 8446 — Trader Trainer                         |
| `MYSQL_ROOT_PASSWORD` | MySQL root password (change it!)              |
| `IMAGE_TAG`           | `latest` or a specific version tag            |
| `LOG_LEVEL`           | `info` (or `debug` for diagnostics)           |

> Do not expose database ports (27017, 3306) on the public interface.

### 7. Image Pull & Startup

```bash
# Authenticate to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u <USERNAME> --password-stdin

# Pull images
docker compose pull

# Or build locally
docker compose build

# Start services
docker compose up -d

# Wait for startup (30-60 seconds)
watch docker compose ps
```

### 8. Verification

```bash
docker compose ps
```

Expected:

```
NAME               IMAGE                                                   STATUS
trading-mongo      mongo:7                                                 Up (healthy)
trading-mysql      mysql:8                                                 Up (healthy)
trading-discovery  ghcr.io/trading-model/discovery-server:latest           Up (healthy)
trading-message    ghcr.io/trading-model/message-manager:latest            Up (healthy)
trading-scraper    ghcr.io/trading-model/financial-scraper:latest          Up (healthy)
trading-trainer    ghcr.io/trading-model/trader-trainer:latest             Up (healthy)
trading-gateway    ghcr.io/trading-model/api-gateway:latest                Up (healthy)
trading-audit      ghcr.io/trading-model/audit-logger:latest               Up (healthy)
trading-admin      ghcr.io/trading-model/admin-interface:latest            Up (healthy)
```

Individual health checks:

```bash
curl -sk https://localhost:8443/ping    # Discovery Server
curl -sk https://localhost:8444/ping    # Message Manager
curl -sk https://localhost:8445/ping    # Financial Scraper
curl -sk https://localhost:8446/ping    # Trader Trainer
curl -sk https://localhost:8448/ping    # API Gateway
curl -sk https://localhost:8450/ping    # Audit Logger
curl http://localhost:8449/             # Admin Interface (HTTP)
```

List registered services:

```bash
curl -sk https://localhost:8443/services | jq .
```

---

## Quick Command Reference (checklist)

```bash
# ── OS ────────────────────────────────────────────────
sudo apt update && sudo apt upgrade -y

# ── Packages ──────────────────────────────────────────
sudo apt install -y ca-certificates curl gnupg git openssl jq bc ufw

# ── Docker ────────────────────────────────────────────
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
# (reconnect)

# ── Project ───────────────────────────────────────────
git clone https://github.com/trading-model/trading-model.git
cd trading-model
bun install --frozen-lockfile && bun run build
cp .env.example .env
# nano .env

# ── Startup ───────────────────────────────────────────
docker compose pull
docker compose up -d
docker compose ps
curl -sk https://localhost:8443/ping
```

---

## Fleet machine (beta / production)

On fleet machines, only Docker is required:

```bash
# No Bun, no build
git clone https://github.com/trading-model/trading-model.git
cd trading-model
cp .env.example .env
IMAGE_TAG=<version> docker compose pull
IMAGE_TAG=<version> docker compose up -d
```

> mTLS is automatic via SPIRE (ADR-0011) — no certificate generation or `./certs`
> bundle is needed on fleet machines.

Development tools (Bun, compilers) are not needed on fleet machines.
