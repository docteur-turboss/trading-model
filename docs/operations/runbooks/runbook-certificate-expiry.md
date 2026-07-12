# Runbook: TLS Certificate Expiry

**Alert:** `CertificateExpiry`  
**Severity:** SEV2 (warning), SEV1 (if expired)

## Detection

- Prometheus alert: `CertificateExpiry` fires when last renewal > 7 days
- mTLS handshake failures between services
- Logs show "certificate expired" or "x509: certificate has expired"

## Automated Renewal

The certificate-client package handles automatic mTLS certificate renewal:

- Renewal is triggered before expiry (margin: `CERT_ROTATION_MARGIN_MS` = 17280000ms = 5 days)
- The CA issues new certificates automatically
- Services hot-reload TLS config via `reloadTlsPaths()` on `HttpClient`

## Manual Renewal

### If automatic renewal failed:

```bash
# 1. Check CA is operational
kubectl exec -n trading-model deployment/certificate-authority -- \
  curl -sk https://localhost:3000/ping

# 2. Check certificate expiry for a service
kubectl exec -n trading-model deployment/discovery-server -- \
  openssl s_client -connect localhost:3000 -cert /certs/server.crt -key /certs/server-key.pem </dev/null 2>/dev/null | \
  openssl x509 -noout -enddate

# 3. Force certificate renewal by restarting the service
kubectl rollout restart -n trading-model deployment/discovery-server
kubectl rollout status -n trading-model deployment/discovery-server

# 4. Verify new certificate
kubectl exec -n trading-model deployment/discovery-server -- \
  openssl s_client -connect localhost:3000 -cert /certs/server.crt -key /certs/server-key.pem </dev/null 2>/dev/null | \
  openssl x509 -noout -enddate
```

### Full PKI renewal (if CA cert itself is expiring):

```bash
# 1. Generate new CA cert
cd scripts
./generate-certs.sh

# 2. Deploy new CA cert to all services
kubectl create secret generic -n trading-model trading-model-tls \
  --from-file=ca.crt=../certs/ca.crt \
  --from-file=server.crt=../certs/server.crt \
  --from-file=server-key.pem=../certs/server-key.pem \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Restart all services
kubectl rollout restart -n trading-model deployment -l app.kubernetes.io/part-of=trading-model
```

## CA Certificate Management

The CA root certificate has a 10-year validity (`CA_CERT_TTL_MS: 31536000000`).
Intermediate certificates are rotated daily (`CERT_ROTATION_INTERVAL_MS: 86400000`).

### Monitor CA cert expiry

```bash
kubectl exec -n trading-model deployment/certificate-authority -- \
  openssl x509 -in /etc/ca-keys/ca-cert.pem -noout -enddate
```

## Prevention

- CA automatic rotation is enabled and monitored
- Certificate expiry alert at 7 days before expiration
- Keep `scripts/generate-certs.sh` available for emergency re-issuance
- Monitor `certificate_last_renewed_seconds` metric in Grafana
