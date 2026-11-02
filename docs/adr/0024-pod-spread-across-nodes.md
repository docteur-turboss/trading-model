# ADR-0024: Replicas Spread Evenly Across Nodes

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0023](./0023-discovery-registry-in-redis.md) (discovery replicas now share their registry), [ADR-0019](./0019-message-broker-as-built.md)
**Verified by:** `tests/k8s/check-overlays.mjs`

## Context

The 13.09 operations audit (A16) noted that HPA and anti-affinity were missing. HPAs and PDBs exist, but no application Deployment constrained where its pods land, except `trader-trainer` (required anti-affinity) and `otel-collector` (preferred anti-affinity):

| Deployment | Replicas (prod) | HPA max | Placement before |
| --- | --- | --- | --- |
| discovery-server | 3 | 10 | none |
| message-manager | 3 | 12 | none |
| api-gateway | 2 | 8 | none |
| audit-logger, edge-proxy | 2 | 5 | none |
| dlq-service | 2 | 4 | none |
| financial-scraper | 2 | 6 | none |
| trader-trainer | 2 | 3 | required anti-affinity |
| otel-collector | 2 | — | preferred anti-affinity |

The scheduler's default spreading is a scoring preference: under resource pressure, after a drain or over successive rollouts, every replica of a service can end up on one node, whose loss then stops the service. PDBs (`minAvailable`) only cover voluntary disruptions, not a node crash.

Three mechanisms were compared:

- **Required anti-affinity** (one pod per node): an HPA can never exceed the node count. With 3 nodes, discovery (max 10) or message-manager (max 12) would leave pods `Pending`; trader-trainer (max 3) needed 3 nodes to scale.
- **Preferred anti-affinity**: no guarantee, the situation above.
- **Topology spread constraints**: a hard bound on imbalance that still lets replicas outnumber nodes.

## Decision

Every Deployment that can run more than one pod (its `replicas` or its HPA `maxReplicas`) declares:

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: DoNotSchedule
    nodeTaintsPolicy: Honor
    matchLabelKeys: [pod-template-hash]
    labelSelector: { matchLabels: { app.kubernetes.io/component: <component> } }
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    nodeTaintsPolicy: Honor
    matchLabelKeys: [pod-template-hash]
    labelSelector: { matchLabels: { app.kubernetes.io/component: <component> } }
```

- **Node, hard**: no node holds more than one pod above the emptiest eligible node (3 pods on 3 nodes: 1/1/1; 10 on 3: 4/3/3).
- **Zone, soft**: spread across zones when nodes carry the label; nodes without it (kind, single-zone clusters) still qualify, which a hard zone constraint would not allow.
- **`nodeTaintsPolicy: Honor`**: tainted or cordoned nodes (control plane, drained node) do not count as empty domains, which would otherwise cap one pod per remaining node.
- **`matchLabelKeys: pod-template-hash`**: the skew is computed per ReplicaSet, so a rollout spreads the new pods without being blocked by the old ones.

The required anti-affinity of `trader-trainer` and the preferred one of `otel-collector` are replaced by the same constraints. Single-replica Deployments (`financial-scraper-collector`) and StatefulSets (databases, Redis, keep their own anti-affinity) are out of scope.

`tests/k8s/check-overlays.mjs` (CI `k8s-overlays`) renders staging and production and fails when a Deployment that may run several pods lacks the node constraint.

## Consequences

### Positive

- Losing one node takes at most `ceil(replicas / nodes)` pods of a service, never all of them.
- HPAs keep scaling past the node count.
- A new multi-replica Deployment without the constraint fails CI.

### Negative

- `DoNotSchedule` can leave a pod `Pending` when the only nodes it may use without exceeding the skew are full; HPA scale-up then waits for capacity. The fix is capacity, not loosening the constraint.
- Two `trader-trainer` pods may now share a node when nodes are fewer than pods (previously the extra pod stayed `Pending`).
- Needs Kubernetes 1.27+ (`matchLabelKeys`, `nodeTaintsPolicy` on by default).
