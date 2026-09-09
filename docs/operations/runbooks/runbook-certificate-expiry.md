# Runbook: SVID / TLS Certificate Expiry

**Alert:** `CertificateExpiry`  
**Severity:** SEV2 (warning), SEV1 (if expired)

## Detection

- Prometheus alert: `CertificateExpiry` fires when an SVID is near expiry
- mTLS handshake failures between services
- Logs show "certificate expired" or "x509: certificate has expired"
- `spiffe-helper` sidecars fail to renew against the Workload API

## Automated Renewal

SPIRE manages SVID lifecycle automatically (ADR-0011):

- `spire-server` issues short-lived X.509-SVIDs (`default_svid_ttl = 1h`); the
  SPIRE agent rotates them before expiry.
- `spiffe-helper` sidecars re-fetch SVIDs and rewrite `svid.pem`,
  `svid_key.pem`, `bundle.pem` in the shared volume.
- The service TLS watcher hot-reloads the files on change
  (`packages/server-utils/src/infrastructure/tls-watcher.ts`); outbound
  `HttpClient` re-reads them per request.

## Manual Renewal

### If automatic renewal failed:

```bash
# 1. Check SPIRE Server and Agent are healthy
kubectl rollout status -n trading-model deployment/spire-server --timeout=60s
kubectl get pods -n trading-model -l app.kubernetes.io/component=spire-agent

# 2. Check the SVID the workload currently presents
kubectl exec -n trading-model deployment/discovery-server -- \
  openssl x509 -in /run/spire/svid/svid.pem -noout -enddate

# 3. Force SVID re-fetch by restarting the spiffe-helper sidecar (or the pod)
kubectl rollout restart -n trading-model deployment/discovery-server
kubectl rollout status -n trading-model deployment/discovery-server

# 4. Verify the renewed SVID
kubectl exec -n trading-model deployment/discovery-server -- \
  openssl x509 -in /run/spire/svid/svid.pem -noout -enddate
```

### Full trust bundle renewal (SPIRE root CA):

```bash
# SPIRE Server manages its own CA (ca_manager). To rotate the root key/cert:
# 1. Trigger rotation on the SPIRE server
kubectl exec -n trading-model deployment/spire-server -- \
  /opt/spire/bin/spire-server rotate -registrationUDSPath /run/spire/server-sockets/admin.sock

# 2. Agents/helpers pick up the new bundle automatically via the Workload API
```

## SPIRE Certificate Management

- SVID TTL: 1 hour (`default_svid_ttl`), renewed by the agent automatically.
- CA TTL: 168h (`ca_ttl`), managed by SPIRE's `ca_manager`.
- Trust bundle is served to all agents through the Workload API.

## Prevention

- SPIRE agent + `spiffe-helper` handle renewal; watch agent logs for
  attestation/rotation errors.
- Monitor the `certificate_last_renewed_seconds` / agent rotation metrics in
  Grafana.