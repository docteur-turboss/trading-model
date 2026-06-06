# Deployment — Complete Guide

> This document serves as the table of contents for all deployment procedures,
> standards, and configurations related to the trading-model monorepo.

---

## Table of Contents

| Topic                                  | Description                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| [CI/CD Pipeline](CI_CD.md)             | GitHub Actions workflows: lint, test, build, Docker image publication, release        |
| [Docker](DOCKER.md)                    | Docker Compose services, multi-stage Dockerfile, GHCR registry, TLS, ports, networks  |
| [Contribution Workflow](CONTRIBUTE.md) | Full cycle from idea to production: branch, commit, PR, review, merge, release        |
| [Setup Guide](SETUP.md)                | Prerequisites, installation, build, TLS certificates, local and fleet verification    |
| [Deployment](DEPLOY.md)                | Local Docker Compose deployment, beta fleet deployment, rollback                      |
| [Database](DATABASE.md)                | MySQL (financial-scraper), MongoDB (message-manager), schemas, volumes, reset         |
| [Environment Variables](ENV.md)        | Exhaustive table of all variables: service, type, default, description                |
| [Troubleshooting](TROUBLESHOOTING.md)  | Common issues by category: Docker, MySQL, MongoDB, TLS, npm, networking, Git, testing |

---

## Overview

```
                    ┌──────────┐
                    │   Code   │
                    └────┬─────┘
                         │ push / PR
                         ▼
              ┌──────────────────────┐
              │   CI (ci.yml)        │
              │   lint → build → test│
              └──────────┬───────────┘
                         │ tag v*
                         ▼
              ┌──────────────────────┐
              │   CD (release.yml)   │
              │   quality → docker   │
              │   → GitHub Release   │
              └──────────┬───────────┘
                         │ images on ghcr.io
                         ▼
              ┌──────────────────────┐
              │   docker compose pull │
              │   docker compose up   │
              └──────────────────────┘
```

To get started, see [Setup Guide](SETUP.md).
