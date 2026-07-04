# Deployment — Complete Guide

> Table of contents for all deployment procedures, standards, and configurations
> related to the trading-model monorepo (9 microservices + infrastructure).

---

## Table of Contents

| Topic                                  | Description                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Setup Guide](SETUP.md)                | Prerequisites, installation, build, TLS certificates, local dev & fleet verification      |
| [Docker](DOCKER.md)                    | Docker Compose (10 containers), multi-stage Dockerfile, GHCR registry, TLS, ports, nginx  |
| [Deployment](DEPLOY.md)                | Local `docker compose up`, beta canary fleet deployment, rollback procedures               |
| [CI/CD Pipeline](CI_CD.md)             | GitHub Actions: lint, typecheck, test, 9-image Docker build & publish, GitHub Release     |
| [Environment Variables](ENV.md)        | Exhaustive table of all variables across all services: type, default, required, description |
| [Database](DATABASE.md)                | MySQL (financial-scraper), MongoDB (5 databases), schemas, volumes, migration, reset      |
| [Kubernetes](KUBERNETES.md)            | K8s manifests, Kustomize overlays (staging/production), HPA, mTLS, observability stack    |
| [Backup & Disaster Recovery](BACKUP_DR.md) | Automated backups (MongoDB, MySQL, Redis, CA keys), restore, DR plan, verification CI |
| [Multi-Region Deployment](MULTI_REGION.md) | Redis-backed distributed registry, region-aware routing, cross-region failover       |
| [Contribution Workflow](CONTRIBUTE.md)   | Full cycle: branch, commit (gitmoji), PR, review, merge, release tag                    |
| [Troubleshooting](TROUBLESHOOTING.md)    | Common issues: Docker, MySQL, MongoDB, TLS, npm, networking, Git, testing                |

---

## Services at a Glance

| # | Service                | Description                                              | Data Store       |
|---|------------------------|----------------------------------------------------------|------------------|
| 1 | `discovery-server`     | Service registry, lease management, health aggregation   | —                |
| 2 | `certificate-authority`| X.509 certificate issuance, rotation, lifecycle          | MongoDB          |
| 3 | `message-manager`      | Event bus / message broker with pub-sub                  | MongoDB          |
| 4 | `financial-scraper`    | Real-time market data ingestion (Binance, etc.)          | MySQL            |
| 5 | `trader-trainer`       | Genetic algorithm + DQN agent evolution                  | —                |
| 6 | `api-gateway`          | External HTTP API gateway with auth, rate limiting       | —                |
| 7 | `audit-logger`         | Immutable event audit trail                              | MongoDB          |
| 8 | `dlq-service`          | Dead-letter queue management and replay                  | MongoDB, Redis   |
| 9 | `admin-interface`      | React SPA (Vite + nginx) for administrative UI           | —                |
| — | `mongo` (infra)        | MongoDB 7 — shared database engine                       | Persistent volume|
| — | `mysql` (infra)        | MySQL 8 — financial-scraper data store                   | Persistent volume|

---

## Overview

```
                    ┌──────────┐
                    │   Code   │
                    └────┬─────┘
                         │ push / PR
                         ▼
              ┌──────────────────────────┐
              │  CI (ci.yml)             │
              │  lint → typecheck → test │
              └──────────┬───────────────┘
                         │ tag v*
                         ▼
              ┌──────────────────────────────────────┐
              │  CD (release.yml)                    │
              │  quality → docker (8 images)          │
              │  → docs (GitHub Pages)               │
              │  → GitHub Release                    │
              └──────────┬───────────────────────────┘
                         │ images on ghcr.io
                         ▼
              ┌──────────────────────┐
              │  docker compose pull │
              │  docker compose up   │
              └──────────────────────┘
```

To get started, see [Setup Guide](SETUP.md).
