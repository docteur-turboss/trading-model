# Deployment — Complete Guide

> Table of contents for all deployment procedures, standards, and configurations
> related to the trading-model monorepo (7 microservices + infrastructure).

---

## Table of Contents

| Topic                                  | Description                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Setup Guide](SETUP.md)                | Prerequisites, installation, build, TLS certificates, local dev & fleet verification      |
| [Docker](DOCKER.md)                    | Docker Compose (10 containers), multi-stage Dockerfile, GHCR registry, TLS, ports, nginx  |
| [Deployment](DEPLOY.md)                | Local `docker compose up`, beta canary fleet deployment, rollback procedures               |
| [CI/CD Pipeline](../ci-cd/README.md)| GitHub Actions: lint, typecheck, test, 9-image Docker build & publish on `vX.Y.Z` tag push     |
| [Environment Variables](ENV.md)        | Exhaustive table of all variables across all services: type, default, required, description |
| [Database](DATABASE.md)                | MySQL (financial-scraper + SPIRE), MongoDB (3 databases), volumes, migration, reset     |
| [Kubernetes](KUBERNETES.md)            | K8s manifests, Kustomize overlays (staging/production), HPA, mTLS, observability stack    |
| [Backup & Disaster Recovery](BACKUP_DR.md) | Automated backups (MongoDB, MySQL, Redis, CA keys), restore, DR plan, verification CI |
| [Encryption at Rest](ENCRYPTION_AT_REST.md) | LUKS2 data disks unlocked by Clevis/Tang or TPM2 (self-hosted), age-encrypted backups |
| [Multi-Region Deployment](MULTI_REGION.md) | Not supported: single region, what a second one would need                          |
| [Sealed Secrets](sealed-secrets.md)    | Encrypted Kubernetes secrets with SealedSecrets controller                                 |
| [Troubleshooting](../troubleshooting/README.md) | Common issues: Docker, MySQL, MongoDB, TLS, bun, networking, Git, testing          |

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
              │  full CI → docker (9 images :X.Y.Z)  │
              └──────────┬───────────────────────────┘
                         │ images on ghcr.io
                         ▼
              ┌──────────────────────┐
              │  docker compose pull │
              │  docker compose up   │
              └──────────────────────┘
```

To get started, see [Setup Guide](SETUP.md).
