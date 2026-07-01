# Kubernetes Deployment Guide

## Overview

This guide covers deploying the Trading Model platform on Kubernetes. The K8s manifests are located in `deploy/k8s/` and are designed to be applied with `kubectl` or Kustomize.

## Prerequisites

- Kubernetes cluster 1.28+ (tested with AKS, EKS, GKE, k3s)
- `kubectl` configured with cluster access
- Ingress controller (nginx-ingress recommended)
- cert-manager for TLS certificate management
- Prometheus Operator (optional, for enhanced alerting)
- StorageClass configured for PVCs (MySQL, MongoDB, Prometheus, Grafana)

## Directory Structure

```
deploy/k8s/
  base/                       # Kustomize base overlay
    namespace.yaml            # trading-model namespace
    kustomization.yaml        # Resource list
  config/                     # ConfigMaps per service (+ HPA, PDB, NetworkPolicy, ServiceAccount)
  secrets/                    # Kubernetes Secrets (placeholder values)
  services/                   # Deployments + Services per microservice
  infra/                      # Infrastructure: MySQL, MongoDB, Redis, OTel, Jaeger, Prometheus, Grafana
  ingress/                    # Ingress rules for API gateway, admin, Grafana
  monitoring/                 # PrometheusRules for alerting
  scripts/                    # deploy-k8s.sh deployment script
```

## Quick Start

### 1. Set up TLS certificates

The platform uses mTLS for all inter-service communication. You need to generate certificates:

```bash
# Generate development certificates
cd scripts
./generate-certs.sh

# Create TLS secret in Kubernetes
kubectl create namespace trading-model
kubectl create secret generic -n trading-model trading-model-tls \
  --from-file=ca.crt=../certs/ca.crt \
  --from-file=server.crt=../certs/server.crt \
  --from-file=server-key.pem=../certs/server-key.pem

# Create CA keys secret
kubectl create secret generic -n trading-model trading-model-ca-keys \
  --from-file=ca-key.pem=../certs/ca-key.pem
```

### 2. Configure secrets

Edit `deploy/k8s/secrets/` to set production values, then:

```bash
# Apply secrets (or use SealedSecrets/SOPS for production)
kubectl apply -k deploy/k8s/secrets/
```

For production, use SealedSecrets or an external secrets operator:
```bash
# Example with Bitnami SealedSecrets
kubeseal < deploy/k8s/secrets/secrets.yaml > deploy/k8s/secrets/sealed-secrets.yaml
kubectl apply -f deploy/k8s/secrets/sealed-secrets.yaml
```

### 3. Deploy all resources

```bash
# Using the deploy script
./deploy/k8s/scripts/deploy-k8s.sh apply

# Or directly with Kustomize
kubectl apply -k deploy/k8s/

# Verify deployment
./deploy/k8s/scripts/deploy-k8s.sh status
```

### 4. Run smoke tests

```bash
./deploy/k8s/scripts/deploy-k8s.sh smoke-test
```

## Deployment Strategy

### Standard deployment
```bash
./deploy/k8s/scripts/deploy-k8s.sh apply <service-name>
```

### Canary deployment
```bash
# Deploy to 10% of instances first, monitor, then full rollout
./deploy/k8s/scripts/deploy-k8s.sh canary <service-name> 10
```

### Rollback
```bash
# Rollback to previous version
./deploy/k8s/scripts/deploy-k8s.sh rollback <service-name>

# Rollback to specific revision
kubectl rollout history -n trading-model deployment/<service-name>
./deploy/k8s/scripts/deploy-k8s.sh rollback <service-name> <revision>
```

## Scaling

### Autoscaling
HPAs are configured for all services in their respective ConfigMap manifests:

| Service | Min | Max | Metric |
|---------|-----|-----|--------|
| discovery-server | 3 | 10 | CPU 70%, Memory 75% |
| message-manager | 3 | 12 | CPU 65%, Memory 70%, Queue depth |
| api-gateway | 2 | 8 | CPU 70%, Memory 75% |
| certificate-authority | 2 | 4 | CPU 70% |
| financial-scraper | 2 | 6 | CPU 70% |
| trader-trainer | 1 | 3 | CPU 80% |
| audit-logger | 2 | 5 | CPU 70% |
| dlq-service | 2 | 4 | CPU 70% |
| admin-interface | 2 | 5 | CPU 70% |

### Manual scaling
```bash
kubectl scale deployment -n trading-model <service-name> --replicas=5
```

## Infrastructure Components

### MySQL
- StatefulSet with 1 replica
- 10Gi PVC for data persistence
- Initial schema loaded via ConfigMap
- PodDisruptionBudget: minAvailable 1

### MongoDB (Replica Set)
- StatefulSet with 3 replicas
- 20Gi PVC per replica
- Replica set initialized via init Job
- Headless service for DNS-based discovery
- PodDisruptionBudget: minAvailable 2

### Redis + Sentinel
- Redis primary: StatefulSet, 1 replica, 10Gi PVC
- Redis sentinel: StatefulSet, 3 replicas, anti-affinity
- Sentinel configuration via ConfigMap
- Services for primary and sentinel discovery

### Observability Stack
- **OpenTelemetry Collector:** 2 replicas, accepts OTLP HTTP
- **Jaeger:** 1 replica, OTLP gRPC receiver
- **Prometheus:** StatefulSet, 50Gi PVC, 30d retention, mTLS scrape
- **Grafana:** StatefulSet, 10Gi PVC, Prometheus + Jaeger datasources

## Security

### Network Policies
All services have NetworkPolicies that restrict ingress/egress:
- Ingress: only from `trading-model` namespace (except api-gateway and admin-interface)
- Egress: only to required infrastructure ports
- External egress: only for financial-scraper (Binance API)

### Secrets Management
- **Development:** Kubernetes Secrets with generator values
- **Production:** Use SealedSecrets, External Secrets Operator, or Vault
- **TLS certificates:** Managed via cert-manager ClusterIssuer + K8s Secrets

### Service Accounts
Each service has a dedicated ServiceAccount with `automountServiceAccountToken: false` (no pods need K8s API access).

## Known Limitations (current version)

1. **MySQL is single-instance** — no read replicas or semi-sync replication configured
2. **Grafana is single-instance** — dashboard provisioning but no HA
3. **Jaeger is single-instance** — in-memory storage (not Elasticsearch/Cassandra)
4. **Redis sentinel** is configured but may need tuning for production workloads
5. **No PodSecurityPolicy/OpaGatekeeper** — pods run restricted but no admission controller
