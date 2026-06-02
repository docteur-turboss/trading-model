# Quickstart

Run the full trading platform on your machine in ~10 minutes. No prior
knowledge of Node.js, Docker, or TypeScript required.

---

## Prerequisites

Install these (one-time):

| Tool            | Windows                                                                    | macOS                        | Linux                           |
| --------------- | -------------------------------------------------------------------------- | ---------------------------- | ------------------------------- |
| **Git**         | `winget install Git.Git`                                                   | `brew install git`           | `apt install git`               |
| **Docker**      | [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) | `brew install --cask docker` | `apt install docker-compose-v2` |
| **Node.js 20+** | `winget install OpenJS.NodeJS.LTS`                                         | `brew install node@20`       | `apt install nodejs`            |
| **OpenSSL**     | Included in Git Bash                                                       | pre-installed                | pre-installed                   |

---

## Steps

### 1. Download

```bash
git clone https://github.com/trading-model/trading-model.git
cd trading-model
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Build

```bash
npm run build
```

### 4. TLS certificates

```bash
mkdir -p certs
openssl req -new -x509 -days 365 -nodes -subj "/CN=Trading-CA" -keyout certs/ca-key.pem -out certs/ca.crt
openssl genrsa -out certs/server-key.pem 2048
openssl req -new -key certs/server-key.pem -subj "/CN=localhost" -out certs/server.csr
openssl x509 -req -days 365 -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca-key.pem -CAcreateserial -out certs/server.crt
rm -f certs/server.csr certs/ca-key.pem certs/ca.srl
```

> On Linux/macOS use `rm` without `-f`; on Windows use Git Bash.

### 5. Configure

```bash
cp .env.example .env
```

Defaults work for local development. Edit `MYSQL_ROOT_PASSWORD` if needed.

### 6. Start

```bash
docker compose up -d
```

First run downloads database images (MongoDB 7, MySQL 8) and builds service
images — expect 1–3 minutes.

### 7. Verify

```bash
docker compose ps
```

All 6 services should show `Up` or `healthy`:

```
trading-mongo      Up (healthy)
trading-mysql      Up (healthy)
trading-discovery  Up (healthy)
trading-message    Up (healthy)
trading-scraper    Up (healthy)
trading-trainer    Up (healthy)
```

```bash
curl -k https://localhost:8443/ping
docker compose logs -f    # real-time logs
```

### 8. Run tests

```bash
npm test
```

### 9. Stop

```bash
docker compose down       # stop, keep database data
docker compose down -v    # stop and delete database data
```

---

## Architecture (what just started)

```
               ┌──────────────────┐
               │ Discovery Server │  port 8443 — service registry
               └────────┬─────────┘
                        │
      ┌─────────────────┼─────────────────┐
      ▼                 ▼                  ▼
 ┌──────────┐    ┌──────────────┐    ┌──────────────┐
 │  Message  │    │   Financial  │    │    Trader    │
 │  Manager  │    │   Scraper    │    │   Trainer    │
 │ port 8444 │    │  port 8445   │    │  port 8446   │
 └─────┬─────┘    └──────┬───────┘    └──────────────┘
       ▼                 ▼
 ┌──────────┐     ┌──────────┐
 │ MongoDB  │     │  MySQL   │
 └──────────┘     └──────────┘
```

| Service               | What it does                                              |
| --------------------- | --------------------------------------------------------- |
| **Discovery Server**  | Central service registry — every service registers here   |
| **Message Manager**   | Event bus for async inter-service messaging               |
| **Financial Scraper** | Fetches market data (OHLCV, trades, tickers) from Binance |
| **Trader Trainer**    | AI agent training via Genetic Algorithm + DRL             |

---

## Next steps

- [Workflow Guide](./WORKFLOW.md) — contribute code, release, deploy
- [Configuration Reference](./CONFIGURATION.md) — all environment variables
- [Database Models](./database-models.md) — schema documentation
- [Troubleshooting](./TROUBLESHOOTING.md) — common issues and fixes
