# Setup Guide — Local Dev & Production Fleet

## Prerequisites

| Tool                           | Version    | Usage                      |
| ------------------------------ | ---------- | -------------------------- |
| Node.js                        | 20+        | JavaScript runtime         |
| npm                            | (included) | Package manager            |
| Docker Desktop / Docker Engine | 24+        | Containerization           |
| Git                            | 2.40+      | Version control            |
| OpenSSL                        | 3.x        | TLS certificate generation |

Verify installed versions:

```bash
node --version     # ≥ 20.x
npm --version
docker --version   # ≥ 24.x
git --version      # ≥ 2.40
openssl version    # ≥ 3.x
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
npm ci
```

`npm ci` uses the lockfile (`package-lock.json`) for a deterministic and reproducible installation.

### 3. Build shared packages

```bash
npm run build
```

Compiles the monorepo packages in this order:

1. `common` (`packages/common`)
2. `address-manager` (`packages/address-manager`)
3. `broker-message` (`packages/broker-message`)
4. `certificate-utils` (`packages/certificate-utils`)

Packages are used by all 9 microservices as `@trading-model/*` workspace dependencies.

### 4. Generate TLS certificates

```bash
mkdir -p certs
openssl req -new -x509 -days 365 -nodes -subj "/CN=Trading-CA" -keyout certs/ca-key.pem -out certs/ca.crt
openssl genrsa -out certs/server-key.pem 2048
openssl req -new -key certs/server-key.pem -subj "/CN=localhost" -out certs/server.csr
openssl x509 -req -days 365 -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca-key.pem -CAcreateserial -out certs/server.crt
rm -f certs/server.csr certs/ca-key.pem certs/ca.srl
```

Produces the following files in `./certs/`:

| File             | Role                                |
| ---------------- | ----------------------------------- |
| `ca.crt`         | Certificate Authority certificate   |
| `server.crt`     | Server certificate signed by the CA |
| `server-key.pem` | Server private key                  |

Certificates are mounted read-only in each Docker container via `${TLS_CERTS_DIR:-./certs}:/certs:ro`.

> **Never commit certificates.** They are in `.gitignore`.

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

All 10 containers should show `Up` or `healthy`:

```
trading-mongo      Up (healthy)
trading-mysql      Up (healthy)
trading-discovery  Up (healthy)
trading-ca         Up (healthy)
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
curl -sk https://localhost:8447/ping     # certificate-authority
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
npm test
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

#### Node.js (optional — for local builds)

```bash
if command -v node &> /dev/null; then
    echo "Node.js already installed: $(node --version)"
else
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
    sudo apt install -y nodejs
fi
node --version   # Expected: v22.x
npm --version
```

### 4. TLS Certificates

The project uses **mTLS** for all inter-service communication. Every server needs its own set.

#### 4.1 Generate the CA (once, on admin machine)

```bash
mkdir -p certs && cd certs
openssl req -new -x509 -days 3650 -nodes \
    -subj "/CN=Trading-CA" \
    -keyout ca-key.pem \
    -out ca.crt
cd ..
```

> **Store `ca-key.pem` in a safe place.** It is the root of trust for the entire fleet.

#### 4.2 Generate per-host server certificate

```bash
cd trading-model
mkdir -p certs
openssl genrsa -out certs/server-key.pem 2048
openssl req -new -key certs/server-key.pem \
    -subj "/CN=$(hostname -f)" \
    -out certs/server.csr
# Sign with the CA (requires ca-key.pem)
openssl x509 -req -days 365 \
    -in certs/server.csr \
    -CA certs/ca.crt \
    -CAkey certs/ca-key.pem \
    -CAcreateserial \
    -out certs/server.crt
rm -f certs/server.csr certs/ca.srl
```

#### 4.3 Copy certificates (if signing was remote)

```bash
scp certs/ca.crt trading@<NEW_SERVER>:~/trading-model/certs/
scp certs/server.crt trading@<NEW_SERVER>:~/trading-model/certs/
scp certs/server-key.pem trading@<NEW_SERVER>:~/trading-model/certs/
```

### 5. Project Checkout

```bash
cd ~
git clone https://github.com/trading-model/trading-model.git
cd trading-model

# Install npm dependencies (try clean install, fall back to install)
npm ci 2>/dev/null || { echo "npm ci failed — falling back to npm install"; npm install; }

# TypeScript build (only needed for local image builds)
npm run build
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
| `TLS_CERTS_DIR`       | Path to certificates directory                |
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
trading-ca         ghcr.io/trading-model/certificate-authority:latest      Up (healthy)
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
curl -sk https://localhost:8447/ping    # Certificate Authority
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
npm ci && npm run build
mkdir -p certs && cd certs
openssl req -new -x509 -days 365 -nodes -subj "/CN=Trading-CA" \
    -keyout ca-key.pem -out ca.crt
openssl genrsa -out server-key.pem 2048
openssl req -new -key server-key.pem -subj "/CN=$(hostname -f)" \
    -out server.csr
openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca-key.pem \
    -CAcreateserial -out server.crt
rm -f server.csr ca-key.pem ca.srl
cd ..
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
# No Node.js, no build
git clone https://github.com/trading-model/trading-model.git
cd trading-model
cp .env.example .env
mkdir -p certs && openssl req -x509 -nodes ...  # or copy certs
IMAGE_TAG=<version> docker compose pull
IMAGE_TAG=<version> docker compose up -d
```

Development tools (Node.js, npm, compilers) are not needed on fleet machines.
