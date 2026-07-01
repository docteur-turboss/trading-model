# On-Call Procedures

## Rotation

- **Duration:** 1 week (Monday to Monday)
- **Shift start:** 09:00 local time
- **Handoff:** Friday 16:00, overlapping with incoming engineer

## Responsibilities

### During shift

1. Respond to alerts within SLO (15 min SEV1, 1 hour SEV2)
2. Acknowledge all alerts in PagerDuty/Opsgenie within 5 minutes
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

```
discovery-server:       curl -sk https://discovery-server:3000/ping
message-manager:        curl -sk https://message-manager:3000/health/ready
certificate-authority:  curl -sk https://certificate-authority:3000/ping
api-gateway:            curl -sk https://api-gateway:3000/ping
audit-logger:           curl -sk https://audit-logger:3000/ping
dlq-service:            curl -sk https://dlq-service:3000/health
financial-scraper:      curl -sk https://financial-scraper:3000/health
trader-trainer:         curl -sk https://trader-trainer:3000/ping
admin-interface:        curl -s http://admin-interface:80/ping
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
