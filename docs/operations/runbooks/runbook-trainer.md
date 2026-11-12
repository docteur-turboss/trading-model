# Runbook: Trainer Failures

**Alerts:** `TrainingCompletionRateLow` (warning, SLO `training_completion`,
target in [slo.md](../slo.md#6-training-completion-rate)),
`TrainingCompletionRateCritical` (critical, same SLO),
`TrainerNoModelStored` (critical),
`ModelArtifactWriteFailing` (warning),
`TrainerEventLoopBlocked` (warning),
`TrainerEventLoopLagHigh` (warning),
`TrainerNoLeader` (warning), `TrainerNoLeaderProlonged` (critical, 30 min),
`ModelBelowBuyAndHold` (warning), `TrainerFeatureDrift` (warning).

No market data reaching the trainer is a different alert,
`TrainerMarketDataStale` ([runbook-market-data-stale](runbook-market-data-stale.md)):
without fresh data the training loop pauses the symbol (log `Market data is
stale: training paused`) and no session is counted at all.

## TrainingCompletionRateLow

`TrainingCompletionRateCritical` (critical, pages) is the same ratio under 50%; it inhibits the warning of the same job.

`tt_training_sessions_total{result="success"}` over all sessions of a job is
under 95% over 15 min, for 15 min. A session is counted only once it starts:
a symbol skipped for lack of data or stale data counts neither as success nor
as failure. A failure is an exception during the GA / DQN session
(`result="fail"`, log `Training failed` with the symbol and the error).

### Symptom

The trainer runs but most sessions end in error: no new best agent, no new
model artifact, `tt_best_fitness` frozen.

### Diagnosis

```bash
NS=trading-model
# 1. Failures and their error message
kubectl -n $NS logs deploy/trader-trainer --tail=500 | grep -E "Training failed|Training complete"

# 2. Sessions by result, and their duration
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum by (result) (increase(tt_training_sessions_total[1h]))'
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,sum by (le) (rate(tt_training_duration_seconds_bucket[1h])))'
# Longest event loop block: one genome evaluation (heartbeats, /metrics and
# candles wait that long). Several seconds: ServiceDown / HeartbeatStopped follow.
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=histogram_quantile(0.99,sum by (le) (rate(tt_genome_evaluation_seconds_bucket[1h])))'

# 3. Memory and restarts (a session holds the population and the replay buffers)
kubectl -n $NS top pods -l app.kubernetes.io/component=trader-trainer
kubectl -n $NS get pods -l app.kubernetes.io/component=trader-trainer

# 4. Current status (mTLS only: use its SVID)
kubectl exec -n $NS deployment/trader-trainer -c trader-trainer -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/training-status
```

Common causes:

1. **Invalid data in the buffer**: NaN or zero prices, a symbol with too few
   candles after a restore; the error names the symbol. Check the source with
   [runbook-market-data-stale](runbook-market-data-stale.md).
2. **Bad configuration after a change** of `TRAINER_*`
   (`deploy/k8s/config/trader-trainer.properties`): `TRAINER_FITNESS_TYPE`,
   `TRAINER_WALK_FORWARD_FOLDS` too high for `TRAINER_DATA_WINDOW`, population
   or generations out of range. Each Deployment revision names its own hashed
   ConfigMap (issue #410); compare two revisions:
   ```bash
   kubectl -n $NS rollout history deploy/trader-trainer
   kubectl -n $NS rollout history deploy/trader-trainer --revision=<n> | grep trader-trainer-config
   kubectl -n $NS get configmap <trader-trainer-config-hash> -o yaml
   ```
3. **Memory pressure**: `HighMemoryUsage` on `trader-trainer`, or pods
   `OOMKilled` ([runbook-service-down](runbook-service-down.md#1-oomkilled-out-of-memory)).
4. **A regression in a new image**: failures started with a deploy.

### Remediation

- Bad configuration: `kubectl -n $NS rollout undo deploy/trader-trainer`
  (the previous pod template names the previous hashed ConfigMap, kept in the
  namespace). Then fix `deploy/k8s/config/trader-trainer.properties` in Git and
  run `Deploy`. Never edit a `trader-trainer-config-*` ConfigMap in place: its
  name would then stand for two contents (a rollback to that revision would
  no longer restore it), and the next deploy overwrites the edit.
- Regression: roll back ([runbook-deployment-failure](runbook-deployment-failure.md)).
- Memory: raise the memory limit or lower `TRAINER_POPULATION_SIZE` /
  `TRAINER_EPISODES_PER_INDIVIDUAL`.
- Bad data: fix the source; the buffer refills from new candles.

The previous artifacts stay valid meanwhile: nothing serving them is affected.

## TrainerEventLoopBlocked

p99 of `tt_genome_evaluation_seconds` above 5 s over 15 min, for 15 min.
The trainer yields between genomes, so the longest block is one evaluation.
Above 10 s (delivery timeout) or 15 s (heartbeat), `ServiceDown`,
`HeartbeatStopped` and DLQ alerts follow: this one names the cause.

### Symptom

Heartbeats, `/metrics` and candle deliveries to the trainer time out in bursts.

### Diagnosis

```bash
NS=trading-model
# p99 evaluation time (the alert expression)
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=histogram_quantile(0.99,sum by (job,le) (rate(tt_genome_evaluation_seconds_bucket[15m])))'
# Lag outside GA evaluation (DQN step, GC, JSON parsing)
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=max_over_time(nodejs_eventloop_lag_max_seconds{job="trader-trainer"}[1h])'
# Settings that grow one evaluation
kubectl -n $NS get deploy trader-trainer -o yaml | grep -E "TRAINER_TIME_BUDGET_MS|POPULATION"
```

Causes: population size or evaluation window (candles per genome) too large;
`TRAINER_TIME_BUDGET_MS` too high; CPU limit throttling the pod. Lag high
while the p99 is low: the block is outside the GA.

### Remediation

1. Reduce the population size or the evaluation window of the trainer.
2. Lower `TRAINER_TIME_BUDGET_MS` (`docs/deployment/ENV.md`).
3. Raise the trainer CPU limit if the pod is throttled.
4. Roll out and check the p99 query falls below 5 s.

## TrainerEventLoopLagHigh

`nodejs_eventloop_lag_max_seconds` of the trainer above 10 s for 5 min. The
metric is a max reset at each scrape, so it catches isolated long blocks (the
#477 incident peaked at 139.9 s) that the p99 of `TrainerEventLoopBlocked`
smooths out, including blocks outside GA evaluation (DQN step, GC, JSON
parsing). Same diagnosis and remediation as `TrainerEventLoopBlocked`: lag high
while the p99 is low means the block is outside the GA (check the DQN step and
memory pressure first).

## TrainerNoLeader

No pod reported `tt_training_leader` = 1 for 5 minutes: no trainer pod holds
the Lease `trader-trainer`, so none trains (ADR-0058). The read routes still
answer from the stored models and the summaries rehydrated at startup; no new
model is produced. A rollout handover lasts the end of one generation plus a
few seconds and never fires it.

```bash
NS=trading-model
# Holder, last renewal, transitions. A holder that is no running pod: the
# Lease expires 15 s after its last renewal and a running trainer takes it.
kubectl -n $NS get lease trader-trainer -o yaml
kubectl -n $NS get pods -l app.kubernetes.io/component=trader-trainer
# Election logs: "Trainer lease acquired", "Trainer lease unreachable",
# "Trainer stops training" (with the reason)
kubectl -n $NS logs deploy/trader-trainer -c trader-trainer --tail=200 | grep -i lease
```

| Seen | Cause and fix |
| --- | --- |
| No trainer pod, or not ready | Deployment scaled to 0 or crash loop: `kubectl -n $NS describe deploy trader-trainer`, then its pod logs |
| `Trainer lease unreachable` with 403 | RBAC: the Role `trader-trainer-lease` or its RoleBinding is missing, or the Lease name differs from `TRAINER_LEASE_NAME`. Apply the overlay again |
| `Trainer lease unreachable` with 404 | The Lease object is missing (the Role grants no `create`). Apply the overlay again |
| `Trainer lease unreachable` with a timeout or ECONNREFUSED | API server unreachable from the pod: NetworkPolicy `trader-trainer-apiserver` (private ranges, 443/6443), or the API server is down |
| Startup error on `/var/run/secrets/kubernetes.io/serviceaccount` | The token is not mounted: `automountServiceAccountToken: true` is missing from the trainer pod template |

A holder that stopped renewing (frozen pod) keeps the Lease for 15 s at most.
To hand it over at once, delete that pod; never edit the Lease by hand while
a trainer runs.

**Resolution check:** `max(tt_training_leader)` is 1 again and
`tt_training_sessions_total` grows.

## ModelArtifactWriteFailing

At least one `tt_model_artifacts_total{result="error"}` in 30 min: a training
succeeded but its best agent could not be written to `TRAINER_MODEL_DIR`
(ADR-0022). The agent then only lives in the trainer memory and is lost at the
next restart. `result="skipped"` (best genome without trained weights) is not
an error and does not fire.

### Diagnosis

```bash
# 1. The write error (ENOSPC, EACCES, EROFS...)
kubectl -n $NS logs deploy/trader-trainer --tail=500 | grep -A3 "Failed to store model artifact"

# 2. The volume: mounted, writable, not full (PVC trainer-checkpoints-pvc, ReadWriteMany)
kubectl -n $NS get pvc trainer-checkpoints-pvc
kubectl exec -n $NS deployment/trader-trainer -c trader-trainer -- df -h /data/checkpoints
kubectl exec -n $NS deployment/trader-trainer -c trader-trainer -- \
  sh -c 'touch /data/checkpoints/models/.write-test && rm /data/checkpoints/models/.write-test && echo writable'

# 3. Versions already kept per symbol (TRAINER_MODEL_RETENTION, default 20)
kubectl exec -n $NS deployment/trader-trainer -c trader-trainer -- ls /data/checkpoints/models
```

Compose: same commands with `docker exec trading-trainer ...` (volume
`trainer-checkpoints`).

Common causes:

1. **Volume full** (`ENOSPC`): grow the PVC, or lower
   `TRAINER_MODEL_RETENTION`. Do not delete versions by hand while a replica
   writes: old versions are pruned after each write.
2. **Not writable** (`EACCES`, `EROFS`): `TRAINER_MODEL_DIR` points outside the
   mounted volume (root filesystem is read-only), or the volume is mounted
   read-only / with the wrong owner.
3. **PVC not bound or storage backend down**: `kubectl get pvc` not `Bound`;
   the pod events show mount errors.

### Remediation

Fix the volume, then wait for the next successful training: the new best
agent is written and the alert resolves after 30 min without error. The agent
lost meanwhile is not recoverable; a restart before the next training loses
the in-memory one too, so do not restart the trainer only to clear the alert.

## TrainerNoModelStored

**Critical (pages).** A trainer holds the Lease (`max(tt_training_leader)` = 1)
but `tt_model_artifacts_total{result="stored"}` has not grown for 3 hours (2
hours after a start: the series is born at 0). A session lasts at most
`TRAINER_TIME_BUDGET_MS` (5 min) and the loop starts one every minute, so a
healthy trainer stores a model every few minutes. This alert sees the useful
output whatever stops it, including what the other trainer alerts miss: on
2026-11-08/10 every session failed (`curve.sharpe is not a function`) for at
least 40 h on the reference compose stack and nobody was paged. While it
fires, the `warning` alerts of the same job (`TrainingCompletionRateLow`,
`ModelArtifactWriteFailing`) are inhibited: look at them in Prometheus.

### Diagnosis

```bash
NS=trading-model
# 1. What the sessions end with: "Training failed" (with the error), "Training
#    complete" then "Model stored" / "Failed to store model artifact" /
#    "Model not stored", or "Market data is stale: training paused"
kubectl -n $NS logs deploy/trader-trainer -c trader-trainer --tail=500 \
  | grep -E "Training failed|Training complete|Model stored|Failed to store|Model not stored|training paused"

# 2. The version that runs: compare it with the release that fixed the error
#    (Prometheus: build_info{service="trader-trainer"}, labels version + git_sha)
kubectl -n $NS get deploy trader-trainer -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Compose: `docker logs trading-trainer 2>&1 | grep ...` and
`docker inspect trading-trainer --format '{{.Config.Image}} {{.Created}}'`.

| Seen | Cause and fix |
| --- | --- |
| `Training failed` on every session | Code or data error: read the error, then [TrainingCompletionRateLow](#trainingcompletionratelow). A fix merged in the repository only acts once the environment runs an image built after it: redeploy (`deploy.yml`, or `docker compose pull && docker compose up -d trader-trainer`) and check `build_info` |
| `Failed to store model artifact` | Volume: see [ModelArtifactWriteFailing](#modelartifactwritefailing) |
| `Model not stored: the best genome has no trained weights` | Every session ends without trained weights (`result="skipped"`): a training regression, check the release notes of the running version |
| `Market data is stale: training paused`, no session at all | No fresh candles: `TrainerMarketDataStale` fires too, follow [runbook-market-data-stale](runbook-market-data-stale.md) |
| No line at all | The loop does not run on the leader: the holder of the Lease is stuck (event loop, see [TrainerEventLoopBlocked](#trainereventloopblocked)); delete that pod to hand the Lease over |

**Resolution check:** `sum(increase(tt_model_artifacts_total{result="stored"}[1h]))`
is above 0 again; the alert resolves at the next evaluation.

## ModelBelowBuyAndHold

The last 3 stored models of a symbol have an out-of-sample Sharpe below buy
and hold on the same bars (issue #884). Every stored model sets, by symbol and
`segment` (`test`, ADR-0068; `validation` for a run without a test segment):

- `tt_model_sharpe`, `tt_model_return` (mean wallet PnL per evaluation
  episode), `tt_model_max_drawdown`: the published metrics of the model;
- `tt_model_buy_and_hold_sharpe`: Sharpe of holding one unit over the same
  bars, annualised the same way;
- `tt_model_below_buy_and_hold_streak`: consecutive stored models below buy
  and hold since the trainer started (in memory: a restart or a Lease handover
  starts it again);
- `tt_model_admission_total{result}`: stored models by ADR-0030 verdict on
  the test segment, `admissible` or `rejected` (ADR-0069).

Only the Lease holder is read: a replica that handed the Lease over keeps its
last gauges. No capital is at stake (no consumer trades the models yet):
`warning`.

### Diagnosis

```bash
# Model vs baseline, by symbol (Prometheus)
tt_model_sharpe - on (job, instance, symbol, segment) tt_model_buy_and_hold_sharpe
# The published metrics of the stored versions (newest first)
kubectl -n $NS exec deploy/trader-trainer -c trader-trainer --   ls /data/checkpoints/models/<SYMBOL>
```

Dashboard "Trader Trainer", panel "Model Sharpe vs buy and hold".

- A strong trend (buy and hold Sharpe high on the validation bars) is hard to
  beat for a model that also goes flat: look at several symbols before acting.
- Every symbol below for long: the training settings (`TRAINER_FITNESS_TYPE`,
  generations, time budget) or a regression of the release; compare with the
  `build_info` of the last good period.

### Remediation

No automatic action. Do not publish these models to a consumer. Re-run the
ADR-0030 walk-forward criteria on the symbol before any use; if the streak
follows a release, roll it back. The alert resolves at the next stored model at
or above buy and hold.

## TrainerFeatureDrift

`tt_feature_drift_score` of a symbol above 3 for 1 hour (issue #884). Before
each session the trainer compares the data received since the newest stored
model (candles, trades, order books, book tickers, 24 h tickers) with the
normalization statistics stored with that model (ADR-0022): the score is the
largest `|live mean - model mean| / model std` over the normalized fields
(`candle.close`, `candle.volume`, `trade.qty`, `book.spread`...). 3 means one
field moved 3 standard deviations of the model's data. One score per symbol,
no label per field (cardinality). The gauge keeps its value while no session
runs for the symbol. Only the Lease holder is read.

### Diagnosis

```bash
# Which field moved: the statistics stored with the newest model
kubectl -n $NS exec deploy/trader-trainer -c trader-trainer --   sh -c 'cat /data/checkpoints/models/<SYMBOL>/$(ls /data/checkpoints/models/<SYMBOL> | tail -1)/manifest.json'   | jq .normalization
```

Compare each `mean` (and `sqrt(m2 / (count - 1))`) with the recent candles of
the symbol (MySQL `market_candles`, or the API). Price fields drift with any
lasting trend; volume or spread fields drifting point at a market regime change
or at a data problem (wrong symbol, unit change at the source).

### Remediation

A real regime change: nothing to fix, the next models train on the new data;
treat their metrics with care until the score falls back. A data problem: fix
the source (scraper, [runbook-market-data-stale](runbook-market-data-stale.md)).
The alert resolves once a session measures a score at or below 3.

## Escalation

Warnings: handle within business hours. `TrainerNoModelStored` pages: handle it
at once. Escalate to the Engineering Manager if no model has been stored for 24
hours (`increase(tt_model_artifacts_total{result="stored"}[24h]) == 0`).
