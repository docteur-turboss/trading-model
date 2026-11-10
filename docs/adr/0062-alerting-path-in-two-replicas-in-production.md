# ADR-0062: Alerting Path in Two Replicas in Production

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0024](./0024-pod-spread-across-nodes.md) (spread across nodes), [ADR-0056](./0056-infrastructure-metrics-exporters.md) (infrastructure metrics)
**Verified by:** `tests/k8s/check-overlays.mjs` (production renders 2 replicas, PodDisruptionBudget and spread for Prometheus and Alertmanager, the Alertmanager cluster peers; staging stays at 1), `scripts/observability-gate.mjs`

## Context

Prometheus and Alertmanager ran one pod each. During a node drain, an eviction or a release no business rule was evaluated and no notification was sent; only the `Watchdog` dead man's switch reported the silence (audit exploitation 2026-11-10, M4, issue #809).

## Decision

1. **Production only.** The `production` overlay runs Prometheus ×2 and Alertmanager ×2, each StatefulSet with a PodDisruptionBudget (`minAvailable: 1`) and a hard `topologySpreadConstraints` on `kubernetes.io/hostname`. Staging and staging-local stay at 1 replica.
2. **Alertmanager cluster.** Pods gossip on port 9094 (TCP and UDP, NetworkPolicy) with `--cluster.peer=alertmanager-headless:9094`; the headless Service resolves to every pod. Silences and notification log are replicated by the cluster, so a notification is sent once.
3. **Prometheus.** Both replicas have the same config and evaluate the same rules. Each sends every alert to every Alertmanager pod (`dns_sd_configs` on `alertmanager-ready`, a headless Service without `publishNotReadyAddresses`, not the Service, which would pick one: a starting or draining pod is neither a target nor a scrape failure, so `ServiceDown` (`up == 0`) does not fire on it). The external label `replica` (pod name, expanded by `--enable-feature=expand-external-labels`, checked by `check-overlays.mjs`) tells the TSDBs apart and is dropped before sending (`alert_relabel_configs` `labeldrop`, the only thing that makes the two copies identical, so Alertmanager deduplicates them), so both copies of an alert are one alert: `Watchdog` reaches the dead man's switch once per route interval and `up`/`absent` alerts are not doubled.
4. **Staying at one replica**, by decision: Grafana, Loki, Jaeger (loss of consultation, not of detection; Loki and Jaeger hold local state), blackbox-exporter and kube-state-metrics (stateless but a restart loses at most one scrape; the `for:` of their alerts covers it).

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| One replica and the dead man's switch only | Says nothing about the business during a drain |
| Thanos / Mimir | Too heavy for the project |
| Alertmanager behind the Service only | The Service picks one pod: the other never sees the alerts |

## Consequences

Prometheus storage and CPU double in production (two 50Gi PVCs). Dashboards read one replica through the Service `prometheus`. The CI renders production but never runs it: a ready cluster with 2 peers and one notification per test alert are checked by hand (`api/v2/status`), not by a job. Gossip is not authenticated: the NetworkPolicy limits port 9094 to the namespace.
