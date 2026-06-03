# New host installation — from bare Linux server to production

Complete procedure to add a bare Linux server to the **Trading Model**
fleet, from the OS all the way to running containers.

---

- [Operating system installation](#1-operating-system-installation)
- [System configuration](#2-system-configuration)
- [Dependency installation](#3-dependency-installation)
- [TLS certificates](#4-tls-certificates)
- [Project checkout](#5-project-checkout)
- [Environment configuration](#6-environment-configuration)
- [Image pull & startup](#7-image-pull--startup)
- [Verification](#8-verification)
- [Add to the deployment fleet](#9-add-to-the-deployment-fleet)
- [Automated deployment (SSH)](#10-automated-deployment-ssh)

---

## 1. Operating system installation

> **Why:** The project runs on Docker (Linux containers). A minimal Ubuntu
> Server avoids unnecessary GUI packages, snap bloat, and background services
> that consume RAM and CPU needed by the trading services. Ubuntu LTS is
> chosen for 5 years of security updates and wide Docker compatibility.

**Recommended:** Ubuntu Server 24.04 LTS (minimal)

### Minimum recommended specs

| Resource | Minimum       | Recommended      |
| -------- | ------------- | ---------------- |
| CPU      | 2 cores       | 4+ cores         |
| RAM      | 4 GB          | 8+ GB            |
| Storage  | 20 GB         | 50+ GB (SSD)     |
| OS       | Ubuntu 22.04+ | Ubuntu 24.04 LTS |

### Installation steps

1. Download the ISO from [ubuntu.com/download/server](https://ubuntu.com/download/server)
2. Create a bootable USB drive (Rufus on Windows, `dd` on Linux)
3. Boot the server and follow the installer:
   - Choose **Ubuntu Server** (not Desktop)
   - Configure a **static IP** (see section 2)
   - Check **Install OpenSSH server** in the software selection
   - Do **not** install extra snaps (Docker will be installed manually)
   - Create an admin user (e.g. `trading`)
4. Reboot and verify SSH access:
   ```bash
   ssh trading@<SERVER_IP>
   ```

---

## 2. System configuration

> **Why:** A predictable hostname, static IP, and reliable time are
> foundational. The Trading Model fleet uses hostnames like
> `trading-scraper-2` to identify roles in logs and monitoring. A static IP
> ensures services and the deployment script (`hosts.json`) can always reach
> this server. UFW locks down everything except the minimal open ports.
> Correct time avoids TLS certificate validation failures.

### 2.1 Hostname

```bash
sudo hostnamectl set-hostname trading-<role>-<number>
# Examples:
#   trading-discovery-1
#   trading-scraper-2
#   trading-trainer-3
```

Add the hostname to `/etc/hosts`:

```bash
echo "127.0.1.1 $(hostname)" | sudo tee -a /etc/hosts
```

### 2.2 Static IP

> **Why:** Containers need a stable address to register with the Discovery
> Server and to be reachable by other hosts. DHCP leases can change after a
> reboot, breaking the service mesh and deployment automation.

Edit `/etc/netplan/00-installer-config.yaml` (or equivalent file).

> **YAML pitfall:** `addresses` expects a **sequence** (a list). The correct
> syntax is `addresses:` on one line, then `  - 192.168.47.100/24` indented on
> the next. Writing `addresses: 192.168.47.100/24` on a single line gives
> **"expected sequence"**. Writing a bare `-` without proper indentation
> gives **"unexpected '-'"**.
>
> **Netplan pitfall:** `192.168.47.X/24` is **not valid** — netplan uses
> `iproute2` under the hood, which requires real numeric octets (0–255).
> Replace `X` with the actual last octet of the host's IP.

**Example** (adapt your interface, subnet, and IP):

```yaml
network:
  ethernets:
    ens33: # your interface (check with `ip a`)
      dhcp4: no # (1)
      dhcp6: no # (2)
      addresses:
        - 192.168.47.100/24 # (3)
      routes:
        - to: default
          via: 192.168.47.2 # (4) check VMware NAT gateway IP
      nameservers:
        addresses:
          - 1.1.1.1 # (5)
          - 8.8.8.8
      match:
        macaddress: 00:0c:29:05:19:a4 # (6)
      set-name: ens33 # (7)
  version: 2 # (8)
```

**Breakdown of each sub-step:**

| #   | Field              | What it does                                                 | Why it is needed                                                                                                                                           |
| --- | ------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `dhcp4: no`        | Disables the IPv4 DHCP client                                | Without this, DHCP keeps modifying `/etc/resolv.conf` and may reassign the IP on reboot, defeating the static configuration                                |
| 2   | `dhcp6: no`        | Disables the IPv6 DHCP client                                | Same for IPv6 — prevents a dynamic address from overriding the static one                                                                                  |
| 3   | `addresses`        | List of static IPs assigned to the interface                 | This is the address other services use to reach this host (Discovery Server, `hosts.json`, monitoring). Must be unique on the network                      |
| 4   | `routes`           | Defines the default gateway                                  | Without a default route, the server cannot reach the outside: ghcr.io registry, Git repo, DNS, etc.                                                        |
| 5   | `nameservers`      | DNS servers                                                  | Required to resolve hostnames (github.com, ghcr.io, etc.) — without DNS, `git clone`, `docker pull`, and `apt` all fail                                    |
| 6   | `match.macaddress` | Binds the configuration to a specific NIC by its MAC address | Prevents the interface from being renamed after a kernel update, BIOS change, or new NIC addition — ensures the config always applies to the right adapter |
| 7   | `set-name`         | Forces the logical interface name (`ens33`)                  | Scripts and documentation reference `ens33`; `set-name` guarantees the name stays stable and predictable                                                   |
| 8   | `version: 2`       | Netplan file format version                                  | Required. Always `2` for modern configurations. Missing or incorrect value causes a validation error                                                       |

> **Important:** replace `192.168.47.100` with your server's actual IP
> and `00:0c:29:05:19:a4` with your NIC's MAC (find it with `ip a`).

Apply:

```bash
sudo netplan apply
```

#### Known issues after applying a static IP (VMware VMs)

If the VM cannot reach the internet after `netplan apply`:

**Symptom:** `ping 8.8.8.8` times out even though `ip a` shows the correct IP and `ip route` shows the default gateway.

**Diagnostic checklist:**

```bash
ip route | grep default          # (0) check the gateway IP
ping -c 1 192.168.47.1          # (1) VMnet8 host adapter?
ping -c 1 192.168.47.2          # (2) VMware NAT gateway?
ping -c 1 8.8.8.8               # (3) internet?
dig +short google.com @1.1.1.1  # (4) DNS?
```

**Three independent causes have been observed:**

| #   | Problem                            | Check                                                        | Fix                                                                                   |
| --- | ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | **Wrong gateway IP in netplan**    | `ip route` shows `via 192.168.47.1` but VMware NAT uses `.2` | Check VMware Virtual Network Editor → NAT Settings → set `via` to the correct gateway |
| 2   | **Windows Firewall blocks VMnet8** | (2) fails with firewall on, succeeds with firewall off       | Add a firewall rule (see below)                                                       |
| 3   | **VMware NAT service stalled**     | (2) succeeds but (3) times out even with firewall off        | Restart the NAT service **as Administrator**                                          |

> **Finding the correct gateway IP:** Open VMware Virtual Network Editor,
> select VMnet8 (NAT), click **NAT Settings**, and read the **Gateway IP**
> field. It is often `192.168.47.2`, not `.1` (the host adapter).

**Fix 1 — Correct the gateway in netplan (run inside the VM):**

```bash
sudo sed -i 's/via: .*/via: 192.168.47.2/' /etc/netplan/00-installer-config.yaml
sudo netplan apply
```

**Fix 2 — Windows Firewall rule (run in PowerShell as Administrator):**

```powershell
New-NetFirewallRule -DisplayName "VMware VMnet8 NAT" `
  -Direction Inbound -InterfaceAlias "VMware Network Adapter VMnet8" `
  -Action Allow
```

Or temporarily disable the firewall to test:

```powershell
netsh advfirewall set allprofiles state off   # test
netsh advfirewall set allprofiles state on    # re-enable
```

**Fix 3 — Restart the VMware NAT Service (run in PowerShell as Administrator):**

```powershell
Restart-Service "VMware NAT Service"
```

Verify it is running:

```powershell
Get-Service "VMware NAT Service" | Select-Object Status, StartType
```

> **Root cause:** The VMware NAT service sometimes stalls after a VM network
> configuration change. It still responds to ARP (the gateway is reachable)
> but stops forwarding packets to the host's physical NIC. A restart
> restores NAT translation.

### 2.3 Swap (optional but recommended if < 8 GB RAM)

> **Why:** Docker containers share the host kernel memory. If the Financial
> Scraper or Trader Trainer hit a memory spike (e.g. large data windows,
> many generations), swap prevents the OOM killer from stopping containers
> or the SSH daemon.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2.4 Firewall (UFW)

> **Why:** The services expose HTTPS APIs on ports 8443–8446. Without a
> firewall, any machine on the network can reach them. UFW ensures only
> SSH and the specific Trading Model ports are open — everything else is
> dropped.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8443/tcp  # Discovery Server
sudo ufw allow 8444/tcp  # Message Manager
sudo ufw allow 8445/tcp  # Financial Scraper
sudo ufw allow 8446/tcp  # Trader Trainer
sudo ufw enable
sudo ufw status verbose
```

> **Note:** the ports above should only be opened if the service needs to be
> reachable from outside the Docker network. For an internal node, only
> the SSH port is required.

### 2.5 Timezone

> **Why:** Log timestamps and market data are timezone-sensitive. Consistent
> timezone across all fleet nodes makes debugging and log correlation
> straightforward. TLS certificate validity also depends on accurate system
> time.

```bash
sudo timedatectl set-timezone Europe/Paris
```

---

## 3. Dependency installation

> **Why:** The project requires Docker (to run the containers), Git (to clone
> the repo), OpenSSL (to generate TLS certificates), `jq` and `bc` (used by
> the `deploy-beta.sh` health-check and monitoring logic), and Node.js (to
> compile TypeScript if building images locally). These tools are not present
> on a minimal Ubuntu install.

### 3.1 System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    git \
    openssl \
    jq \
    bc \
    ufw \
    htop \
    net-tools
```

### 3.2 Docker

> **Pre-check:** If Docker is already installed (e.g. from a previous
> attempt or the convenience script), `docker --version` will show a
> version. In that case, skip straight to the **Verify** step — do **not**
> re-add the repository.

```bash
# Check if Docker is already installed
if command -v docker &> /dev/null; then
    echo "Docker already installed: $(docker --version)"
    echo "Skipping Docker installation."
else
    # Add the official Docker repository
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-v2
fi
```

> **If `apt update` fails with:** `Signed-By ... docker.gpg != docker.asc`
>
> This means a previous installation method left a conflicting keyring file
> (`docker.asc`). Clean it up and retry:
>
> ```bash
> sudo rm -f /etc/apt/sources.list.d/docker.list
> sudo rm -f /etc/apt/keyrings/docker.asc
> # Then re-run the installation block above
> ```

### 3.3 Add user to the docker group

```bash
sudo usermod -aG docker $USER
# Log out and back in to apply:
#   exit  →  ssh trading@<IP>  (new session)
```

Verify:

```bash
docker --version
docker compose version
docker run hello-world
```

### 3.4 Node.js (optional — required to build images locally)

> **Pre-check:** If Node.js is already installed, `node --version` will
> show a version (e.g. v22.x). In that case, skip the NodeSource setup
> and go straight to verifying `npm --version`.

```bash
# Check if Node.js is already installed
if command -v node &> /dev/null; then
    echo "Node.js already installed: $(node --version)"
    echo "Skipping Node.js installation."
else
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
    sudo apt install -y nodejs
fi

node --version   # Expected: v22.x
npm --version
```

> **If `apt update` fails here** (typically with the same
> `Signed-By ... docker.gpg != docker.asc` error), the Docker repository
> is broken. Fix it first by running the cleanup in §3.2, then retry
> this step.

---

## 4. TLS certificates

> **Why:** Every inter-service HTTP request in Trading Model is secured with
> **mutual TLS** — both the client and server present certificates. This
> prevents unauthorized services from joining the mesh and encrypts all
> traffic. Without valid certs in the expected paths, containers will reject
> each other's connections and log TLS handshake errors.

The project uses **mTLS** (mutual TLS) for all inter-service
communication. Every server must have its own set of certificates.

### 4.1 Generate the CA (once, on the admin machine)

> **Why:** The same CA signs certificates for every host in the fleet. If you
> delete its private key (`ca-key.pem`), you cannot add new servers later
> without regenerating everything. Keep this key on a secure admin machine.

```bash
mkdir -p certs && cd certs
openssl req -new -x509 -days 3650 -nodes \
    -subj "/CN=Trading-CA" \
    -keyout ca-key.pem \
    -out ca.crt
cd ..
```

> **Store `ca-key.pem` in a safe place** (password manager, USB key, or
> admin workstation). It is the root of trust for the entire fleet.

### 4.2 Generate per-host server certificate

Run this **on each host** (or on the admin machine for each new host):

```bash
cd trading-model
mkdir -p certs

# Generate a server key and CSR
openssl genrsa -out certs/server-key.pem 2048
openssl req -new -key certs/server-key.pem \
    -subj "/CN=$(hostname -f)" \
    -out certs/server.csr

# Sign with the CA (requires ca-key.pem — run where the CA key is stored)
# If the CA key is on the admin machine, copy the CSR there first:
#   scp certs/server.csr admin@admin-machine:~/certs/
openssl x509 -req -days 365 \
    -in certs/server.csr \
    -CA certs/ca.crt \
    -CAkey certs/ca-key.pem \
    -CAcreateserial \
    -out certs/server.crt

rm -f certs/server.csr certs/ca.srl
```

> **Do NOT delete `certs/ca-key.pem` on the admin machine.** You will need
> it again for every new host. On the **host itself** (`/etc/netplan/...`),
> only `ca.crt`, `server.crt`, and `server-key.pem` are needed — copy them
> with `scp` if signing was done remotely.

### 4.3 Copy certificates (if signing was done remotely)

```bash
# From the admin machine, after signing:
scp certs/ca.crt trading@<NEW_SERVER>:~/trading-model/certs/
scp certs/server.crt trading@<NEW_SERVER>:~/trading-model/certs/
scp certs/server-key.pem trading@<NEW_SERVER>:~/trading-model/certs/
```

> In production, replace the self-signed CA with an internal PKI or
> Let's Encrypt.

### 4.2 Copy from an existing server

If you already have a PKI set up, copy the files to `./certs/`:

```bash
# From your admin machine
scp ca.crt trading@<NEW_SERVER>:~/trading-model/certs/
scp server.crt trading@<NEW_SERVER>:~/trading-model/certs/
scp server-key.pem trading@<NEW_SERVER>:~/trading-model/certs/
```

---

## 5. Project checkout

> **Why:** The `docker-compose.yml`, Dockerfiles, shared packages, and
> deployment scripts all live in this repository. The host needs a local copy
> to run `docker compose pull` (it reads the compose file) and to serve as
> the working directory for the `deploy-beta.sh` remote commands.

```bash
cd ~
git clone https://github.com/docteur-turboss/trading-model.git
cd trading-model
```

### 5.1 npm dependency installation

> **Pre-check:** If `node_modules/` already exists (e.g. from a previous
> install or copy), skip this step.

```bash
# Try clean install first (faster, respects lock file)
npm ci 2>/dev/null || {
    echo "npm ci failed — lock file out of sync, falling back to npm install"
    npm install
}
```

> **If `npm ci` fails with** `Missing: <package> from lock file`, this means
> the `package-lock.json` was generated with a different set of dependencies
> (common after cloning a repo with recent changes). The fallback above runs
> `npm install` which updates the lock file automatically.

### 5.2 TypeScript build

```bash
npm run build
```

> This step compiles the shared packages (`@trading-model/common`,
> `@trading-model/address-manager`, `@trading-model/broker-message`)
> and every service. Only needed if you intend to build Docker images
> locally.

---

## 6. Environment configuration

> **Why:** The `.env` file customizes ports, passwords, image tags, and TLS
> paths for this specific host. Without it, Docker Compose uses defaults that
> may conflict with other hosts on the same network (same ports, same
> passwords). It also controls which image tag to pull (`latest` vs a pinned
> version).

```bash
cp .env.example .env
```

Edit `.env` according to the server's role:

```bash
nano .env
# or
vim .env
```

### Variables to customize

| Variable              | Description                                   |
| --------------------- | --------------------------------------------- |
| `NODE_ENV`            | `production` (or `development` for debugging) |
| `DISCOVERY_PORT`      | 8443 — Discovery Server port                  |
| `MESSAGE_PORT`        | 8444 — Message Manager port                   |
| `SCRAPER_PORT`        | 8445 — Financial Scraper port                 |
| `TRAINER_PORT`        | 8446 — Trader Trainer port                    |
| `TLS_CERTS_DIR`       | Absolute or relative path to certificates     |
| `MYSQL_ROOT_PASSWORD` | MySQL root password (change it!)              |
| `IMAGE_REGISTRY`      | `ghcr.io/trading-model`                       |
| `IMAGE_TAG`           | `latest` or a specific version tag            |
| `LOG_LEVEL`           | `info` (or `debug` for diagnostics)           |

> **Important:** do not expose database ports (MongoDB 27017, MySQL 3306)
> on the public interface. The `.env` does not do this by default, but
> verify that no UFW rule opens them.

---

## 7. Image pull & startup

> **Why:** The service images are hosted on GitHub Container Registry
> (ghcr.io) and require authentication. Database images (MongoDB, MySQL) are
> public on Docker Hub. Pulling first ensures that `docker compose up -d`
> starts instantly without network delays.

### 7.1 GHCR registry authentication

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u <USERNAME> --password-stdin
# Or via a token file:
# docker login ghcr.io -u <USERNAME> --password-stdin < token.txt
```

### 7.2 Pull images

```bash
docker compose pull
```

This downloads the 6 images:

- `mongo:7`
- `mysql:8`
- `ghcr.io/trading-model/discovery-server:latest`
- `ghcr.io/trading-model/message-manager:latest`
- `ghcr.io/trading-model/financial-scraper:latest`
- `ghcr.io/trading-model/trader-trainer:latest`

### 7.3 Local build (alternative to pull)

```bash
docker compose build
```

> Useful if you do not have registry access or if you are testing local
> changes.

### 7.4 Start services

```bash
docker compose up -d
```

Wait for full startup (30-60 seconds):

```bash
watch docker compose ps
```

All containers should show `Up (healthy)` or `Up`.

### 7.5 View logs

```bash
docker compose logs -f          # all services
docker compose logs -f discovery-server  # a specific service
```

---

## 8. Verification

> **Why:** After startup you need to confirm that all 6 containers are
> actually healthy, that TLS is working (the `curl -sk` flag bypasses
> self-signed certs), and that services have registered with the Discovery
> Server. Skipping verification can mask a broken deployment until the next
> canary rollout.

### 8.1 Container status

```bash
docker compose ps
```

Expected output:

```
NAME               IMAGE                                          STATUS
trading-mongo      mongo:7                                        Up (healthy)
trading-mysql      mysql:8                                        Up (healthy)
trading-discovery  ghcr.io/trading-model/discovery-server:latest  Up (healthy)
trading-message    ghcr.io/trading-model/message-manager:latest   Up (healthy)
trading-scraper    ghcr.io/trading-model/financial-scraper:latest Up (healthy)
trading-trainer    ghcr.io/trading-model/trader-trainer:latest    Up (healthy)
```

### 8.2 Individual health checks

```bash
curl -sk https://localhost:8443/ping    # Discovery Server
curl -sk https://localhost:8444/health  # Message Manager
curl -sk https://localhost:8445/health  # Financial Scraper
curl -sk https://localhost:8446/health  # Trader Trainer
```

Each endpoint should return JSON `{ "status": "ok" }` or `{ "ok": true }`.

### 8.3 End-to-end test (if Discovery Server is operational)

```bash
# List registered services
curl -sk https://localhost:8443/services | jq .
```

### 8.4 Shutdown

```bash
docker compose down       # stop services, keep data
docker compose down -v    # stop + delete volumes (destructive!)
```

---

## 9. Add to the deployment fleet

> **Why:** The `deploy-beta.sh` script reads `hosts.json` to know which
> servers exist and which to target for canary vs full rollout. Adding the
> new server here makes it part of the automated deployment lifecycle — it
> will receive future updates when you run the deploy script.

Once the server is operational, add it to the inventory so the automated
deployment script (`deploy-beta.sh`) can reach it.

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

## 10. Automated deployment (SSH)

> **Why:** The `deploy-beta.sh` script SSHes into each host listed in
> `hosts.json` to run `git pull`, `docker compose pull`, and
> `docker compose up -d`. Passwordless SSH key authentication is required
> so the script can run unattended — especially during canary phases that
> may run across 10+ servers sequentially.

For `deploy-beta.sh` to run remote commands, the deployment machine must
be able to connect via SSH without a password.

### 10.1 From the deployment machine

```bash
ssh-keygen -t ed25519 -C "deploy@trading-model"
ssh-copy-id trading@<NEW_SERVER>
```

### 10.2 Verify the connection

```bash
ssh trading@<NEW_SERVER> "docker compose ps"
```

### 10.3 Deploy to the new server

```bash
# Full deployment
./scripts/deploy-beta.sh --hosts ./scripts/hosts.json

# Or canary deployment (only X% of hosts)
./scripts/deploy-beta.sh --canary 10

# Rollback if needed
./scripts/deploy-beta.sh --rollback
```

---

## Quick command reference (checklist)

```bash
# ── 1. OS ────────────────────────────────────────────
sudo apt update && sudo apt upgrade -y

# ── 2. Packages ──────────────────────────────────────
sudo apt install -y ca-certificates curl gnupg git openssl jq bc ufw

# ── 3. Docker ────────────────────────────────────────
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
# (reconnect)

# ── 4. Project ───────────────────────────────────────
git clone https://github.com/docteur-turboss/trading-model.git
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

# ── 5. Startup ───────────────────────────────────────
docker compose pull
docker compose up -d
docker compose ps
curl -sk https://localhost:8443/ping
```
