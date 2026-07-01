# Runbook: Certificate Authority Key Compromise

**Severity:** SEV1 (Critical)  
**Alert:** Manual trigger (security incident)  
**Response time:** Immediate, 24/7

## Detection
- Unauthorized certificate issuance detected
- CA private key exposed (repo leak, compromised vault, etc.)
- Suspicious certificates observed in traffic
- Internal security scan flags key exposure

## Immediate Response (first 15 minutes)

### 1. Isolate the CA
```bash
# Block all incoming traffic to CA
kubectl label pods -n trading-model -l app.kubernetes.io/component=certificate-authority isolate=true

# Or scale to 0
kubectl scale deployment -n trading-model certificate-authority --replicas=0
```

### 2. Revoke ALL certificates issued by the compromised CA
```bash
# Use generate-certs.sh with a NEW CA key
# Generate new CA key pair
openssl genrsa -out new-ca-key.pem 4096
openssl req -x509 -new -nodes -key new-ca-key.pem -sha384 -days 3650 \
  -out new-ca-cert.pem -subj "/CN=Trading Model Root CA v2"

# Deploy new CA key as K8s secret
kubectl create secret generic -n trading-model trading-model-ca-keys-v2 \
  --from-file=ca-key.pem=new-ca-key.pem

# Update the CA deployment to use new keys
kubectl set env deployment -n trading-model certificate-authority \
  CA_KEY_PATH=/etc/ca-keys/ca-key.pem
```

### 3. Force certificate rotation for ALL services
Trigger immediate certificate re-issuance:
```bash
for service in discovery-server message-manager financial-scraper trader-trainer \
               api-gateway audit-logger dlq-service admin-interface; do
  kubectl delete pod -n trading-model -l app.kubernetes.io/component=$service
done
```

### 4. Update all mTLS trust stores
```bash
# Deploy new CA cert
kubectl create secret generic -n trading-model trading-model-tls-v2 \
  --from-file=ca.crt=new-ca-cert.pem
```

## Service Recovery Order
1. **certificate-authority** — Must be online first to issue new certs
2. **discovery-server** — Required by all services for service discovery
3. **message-manager** — Required by data services for event bus
4. **redis** + **mysql** + **mongodb** — Data stores (no mTLS needed)
5. **financial-scraper** + **trader-trainer** — Data producers
6. **api-gateway** + **audit-logger** + **dlq-service** — Consumer services
7. **admin-interface** — UI (least critical)

## Verification
```bash
# Verify CA is operational
kubectl exec -n trading-model deployment/certificate-authority -- \
  curl -sk https://localhost:3000/ping

# Verify mTLS between services
kubectl exec -n trading-model deployment/discovery-server -- \
  curl -sk --cert /certs/server.crt --key /certs/server-key.pem \
  https://certificate-authority:3000/api/v1/certificate/discovery-server

# Run full E2E smoke test
npm run test:e2e:docker
```

## Post-Incident

### Immediate (within 24h)
- [ ] Rotate ALL secrets that were in the cluster at time of compromise
- [ ] Audit certificate-authority access logs
- [ ] Identify leak source and remediate
- [ ] Generate new long-term CA key pair in secure offline environment

### Short-term (within 1 week)
- [ ] Revoke old CA cert at all layers
- [ ] Update backup strategies to exclude compromised keys
- [ ] Implement CA key ceremony policy
- [ ] Deploy Vault/HashiCorp Vault for CA key management

### Long-term
- [ ] Implement automated CA key rotation (quarterly)
- [ ] Add intrusion detection for CA access patterns
- [ ] Consider hardware security module (HSM) for CA keys
- [ ] External audit of PKI implementation
