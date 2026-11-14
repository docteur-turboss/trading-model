# On-Call Procedures

## Rotation

Single maintainer, best effort: no weekly rotation and no handoff. Escalation
is described in [incident-response.md](incident-response.md#escalation-matrix).

> If a team exists one day: add a rotation here (shift length, handoff, backup)
> and update the escalation matrix. Until then, this section stays as is.

## Responsibilities

1. Respond to alerts as fast as possible (target 15 min SEV1, 1 hour SEV2, no guarantee outside working hours)
2. Acknowledge `critical` alerts in Pushover
3. Triage following the matching runbook in `docs/operations/runbooks/`
4. Keep the incident timeline updated
5. Document all actions for the post-mortem

### Daily check

- [ ] Review open incidents
- [ ] Check dashboards for anomalies
- [ ] Verify alert routing works (`Watchdog` reaches the dead man's switch)

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

| Tool         | Kubernetes (`kubectl port-forward -n trading-model ...`) | Docker Compose (host port)       |
|--------------|-----------------------------------------------------------|----------------------------------|
| Grafana      | `svc/grafana 3000:3000` then http://localhost:3000        | http://localhost:3001 (`GRAFANA_PORT`)       |
| Jaeger       | `svc/jaeger 16686:16686` then http://localhost:16686      | http://localhost:16686 (`JAEGER_PORT`)       |
| Prometheus   | `svc/prometheus 9090:9090` then http://localhost:9090     | http://localhost:9090 (`PROMETHEUS_PORT`)    |
| Alertmanager | `svc/alertmanager 9093:9093` then http://localhost:9093   | http://localhost:9093 (`ALERTMANAGER_PORT`)  |

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

### Silence an alert (maintenance)

Alertmanager is the only place to silence. `amtool` ships in the Alertmanager
image (0.27.0 at the pinned digest), so run it inside the pod or container.

```bash
# Kubernetes
AM="kubectl exec -n trading-model statefulset/alertmanager -c alertmanager --"
# Docker Compose
AM="docker exec trading-alertmanager"

$AM amtool silence add alertname=<AlertName> --duration=30m   --comment="<why>" --author=<who> --alertmanager.url=http://localhost:9093
$AM amtool silence query --alertmanager.url=http://localhost:9093            # list
$AM amtool silence expire <silence-id> --alertmanager.url=http://localhost:9093  # lift early
```

Without `amtool`: `kubectl port-forward -n trading-model svc/alertmanager 9093:9093`
then `POST http://localhost:9093/api/v2/silences` (or the UI).

Never silence `Watchdog`: it is the heartbeat to the dead man's switch, and
silencing it reads as "alerting is down". See also
[ALERTING.md](ALERTING.md) and [runbook-discovery](runbooks/runbook-discovery.md).
