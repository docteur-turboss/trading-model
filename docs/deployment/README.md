# Deployment — Complete Guide

> Table of contents for all deployment procedures, standards, and configurations
> related to the trading-model monorepo (7 microservices + infrastructure).

---

## Table of Contents

| Topic                                  | Description                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Setup Guide](SETUP.md)                | Prerequisites, installation, build, local dev & fleet verification                        |
| [Docker](DOCKER.md)                    | Docker Compose, multi-stage Dockerfile, GHCR registry, TLS, ports, nginx  |
| [Deployment](DEPLOY.md)                | Local `docker compose up`, rollback procedures               |
| [CI/CD Pipeline](../ci-cd/README.md)| GitHub Actions: lint, typecheck, test, Docker image build & publish on `vX.Y.Z` tag push     |
| [Environment Variables](ENV.md)        | Exhaustive table of all variables across all services: type, default, required, description |
| [Database](DATABASE.md)                | MySQL (financial-scraper), MongoDB (audit-logger, dlq-service), volumes, migration, reset     |
| [Kubernetes](KUBERNETES.md)            | K8s manifests, Kustomize overlays (staging/production), HPA, mTLS, observability stack    |
| [Local staging](STAGING_LOCAL.md)      | Environment `staging` on a local kind cluster: MinIO, self-hosted runner, overlay `staging-local` |
| [Backup & Disaster Recovery](BACKUP_DR.md) | Automated backups (MongoDB, MySQL, SPIRE), restore, DR plan, verification CI |
| [Encryption at Rest](ENCRYPTION_AT_REST.md) | LUKS2 data disks unlocked by Clevis/Tang or TPM2 (self-hosted), age-encrypted backups |
| [Multi-Region Deployment](MULTI_REGION.md) | Not supported: single region, what a second one would need                          |
| [MySQL TLS](MYSQL_TLS.md)              | cert-manager certificates for MySQL, client verification, rotation                         |
| [MongoDB TLS](MONGO_TLS.md)            | TLS for the MongoDB replica sets                                                           |
| [Redis TLS](REDIS_TLS.md)              | TLS for Redis and Sentinel, `REDIS_TLS_MODE` rollout                                       |
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
              │  full CI → docker (images :X.Y.Z)     │
              └──────────┬───────────────────────────┘
                         │ images on ghcr.io
                         ▼
              ┌──────────────────────────────┐
              │  Deploy (deploy.yml, manual) │
              │  Kubernetes, images by digest│
              └──────────────────────────────┘
```

To get started, see [Setup Guide](SETUP.md).
