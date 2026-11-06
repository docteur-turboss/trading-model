# On-Call Procedures

## Rotation

- **Duration:** 1 week (Monday to Monday)
- **Shift start:** 09:00 local time
- **Handoff:** Friday 16:00, overlapping with incoming engineer

## Responsibilities

### During shift

1. Respond to alerts within SLO (15 min SEV1, 1 hour SEV2)
2. Acknowledge all alerts in Pushover within 5 minutes
3. Triage and escalate as needed
4. Keep incident timeline updated
5. Document all actions for post-mortem

### At shift start

- [ ] Review open incidents from previous shift
- [ ] Check dashboards for anomalies
- [ ] Verify alert routing is working
- [ ] Confirm contact information is current
- [ ] Review any new runbooks or procedures

### At shift end

- [ ] Handoff all open incidents to incoming engineer
- [ ] Update incident status and notes
- [ ] Ensure all runbooks are current
- [ ] Submit any suggestions for improvement

## Quick Reference

### Health check endpoints

Services only accept SPIFFE mTLS clients (ADR-0011): a `curl` without a client
certificate always fails, even against a healthy service. Probe each service
from inside its own container, with its SVID.

| Service           | Route           | Compose container   |
|-------------------|-----------------|---------------------|
| discovery-server  | `/ping`         | `trading-discovery` |
| message-manager   | `/health/ready` | `trading-message`   |
| api-gateway       | `/ping`         | `trading-gateway`   |
| audit-logger      | `/ping`         | `trading-audit`     |
| dlq-service       | `/health`       | `trading-dlq`       |
| financial-scraper | `/health`       | `trading-scraper`   |
| trader-trainer    | `/ping`         | `trading-trainer`   |

```bash
# Kubernetes (<service> and <route> from the table)
kubectl exec -n trading-model deployment/<service> -c <service> -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/<route>

# Docker Compose (<container> and <route> from the table)
docker exec <container> curl -skf --cert /run/spire/svid/svid.pem \
  --key /run/spire/svid/svid_key.pem https://localhost:3000/<route>

# edge-proxy is plain HTTP inside the cluster / stack (no client certificate)
kubectl port-forward -n trading-model svc/edge-proxy 8449:8080 &   # Kubernetes
curl -sf http://localhost:8449/ping   # Kubernetes (port-forward) or Compose (host port EDGE_PORT)
```

### Key dashboards

- **Grafana:** https://grafana.trading-model.example.com
- **Jaeger:** https://jaeger.trading-model.example.com
- **Prometheus:** https://prometheus.trading-model.example.com

### Useful commands

```bash
# Get pod status
kubectl get pods -n trading-model

# View logs
kubectl logs -n trading-model deployment/<service-name> --tail=100

# Restart deployment
kubectl rollout restart -n trading-model deployment/<service-name>

# Rollback deployment
kubectl rollout undo -n trading-model deployment/<service-name>

# Check rollout status
kubectl rollout status -n trading-model deployment/<service-name>

# Port forward for debugging
kubectl port-forward -n trading-model pod/<pod-name> 3000:3000

# Exec into container
kubectl exec -n trading-model -it deployment/<service-name> -- sh
```

### Alert acknowledgement

```bash
# Silence alert for 30 minutes (maintenance)
kubectl annotate --overwrite -n trading-model prometheusrule/trading-model-alerts \
  "silence/maintenance"="until $(date -d '+30 minutes' -Iseconds)"
```
