# Sealed Secrets

The `trading-model-secrets` secret contains 11 sensitive values. Instead of storing them as plaintext in `kustomization.yaml` (which exposes them in git and requires manual `change-me-in-production` replacement), we use **Sealed Secrets** — encrypted secrets that are safe to commit to git.

## How it works

1. The **SealedSecrets controller** runs in the cluster and manages a cryptographic key pair
2. The **kubeseal** CLI encrypts secrets using the controller's public key
3. The encrypted `SealedSecret` can be committed to git — only the controller in the cluster can decrypt it
4. The controller decrypts and creates a standard `Secret` resource
5. The plaintext is never stored in git

## Setup

### 1. Install the SealedSecrets controller

```bash
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.1/controller.yaml
```

### 2. Encrypt your production secrets

```bash
# Create a temporary plaintext secret file (NOT committed to git)
kubectl create secret generic trading-model-secrets \
  --namespace trading-model \
  --from-literal=AUTH_TOKENS='your-real-tokens' \
  --from-literal=SIGNING_SECRET='your-signing-secret' \
  --from-literal=SERVICE_BOOTSTRAP_TOKEN='your-bootstrap-token' \
  --from-literal=CA_BOOTSTRAP_TOKEN='your-ca-bootstrap-token' \
  --from-literal=CA_BOOTSTRAP_TOKENS='your-ca-bootstrap-tokens' \
  --from-literal=MYSQL_ROOT_PASSWORD='your-mysql-root-password' \
  --from-literal=MYSQL_PASSWORD='your-mysql-password' \
  --from-literal=DLQ_AUTH_HMAC_SECRET='your-dlq-hmac-secret' \
  --from-literal=ADMIN_TOKEN='your-admin-token' \
  --from-literal=GRAFANA_PASSWORD='your-grafana-password' \
  --from-literal=HMAC_SECRET='your-hmac-secret' \
  --dry-run=client -o yaml > /tmp/plaintext-secret.yaml

# Seal it (requires kubeseal CLI)
kubeseal -o yaml < /tmp/plaintext-secret.yaml > deploy/k8s/secrets/trading-model-sealed-secrets.yaml

# Clean up
rm /tmp/plaintext-secret.yaml
```

### 3. Apply

```bash
kubectl apply -f deploy/k8s/secrets/trading-model-sealed-secrets.yaml
```

## Key rotation

To rotate the SealedSecrets controller's encryption key:

```bash
kubeseal --rotate
```

## Migration from plaintext Kustomize

The original `kustomization.yaml` with plaintext `literals` is replaced by the `trading-model-sealed-secrets.yaml` SealedSecret resource. Remove the `secretGenerator` with `literals` from `kustomization.yaml` once you have encrypted your secrets.
