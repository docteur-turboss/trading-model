# Deployment Guide

## Overview

This document describes the deployment strategy for the trading-model monorepo.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (recommended)
- Access to container registry (Docker Hub, GHCR, etc.)

## Build

Each package and service can be built independently:

```bash
# Build all packages
npm run build

# Build individual packages
npm run build:common
npm run build:address-manager
npm run build:broker-message
```

## Docker Deployment

### Service Images

Each microservice has its own Dockerfile. Build images with:

```bash
docker build -t trading-model/discovery-server ./services/discovery-server
docker build -t trading-model/financial-scraper ./services/financial-scraper
docker build -t trading-model/message-manager ./services/message-manager
docker build -t trading-model/trader-trainer ./services/Trader-Trainer
```

### Docker Compose

Use the docker-compose file to deploy all services:

```bash
docker-compose up -d
```

## Environment Configuration

1. Copy `.env.example` to `.env` for each service
2. Set appropriate values for each environment
3. Never commit secrets to version control

## CI/CD Pipeline

1. **Lint** - ESLint checks
2. **Test** - Jest with 80%+ coverage threshold
3. **Build** - TypeScript compilation
4. **Deploy** - Automatic on main branch merge

## Monitoring

- Health check endpoints: `/health`
- Service discovery provides real-time health status
