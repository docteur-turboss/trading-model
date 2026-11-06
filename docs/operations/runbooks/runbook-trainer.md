# Runbook: Trainer Failures

**Alerts:** `TrainingCompletionRateLow` (warning, SLO `training_completion`,
target in [slo.md](../slo.md#6-training-completion-rate)),
`ModelArtifactWriteFailing` (warning).

No market data reaching the trainer is a different alert,
`TrainerMarketDataStale` ([runbook-market-data-stale](runbook-market-data-stale.md)):
without fresh data the training loop pauses the symbol (log `Market data is
stale: training paused`) and no session is counted at all.

## TrainingCompletionRateLow

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

## Escalation

Warnings: handle within business hours. Escalate to the Engineering Manager if
no model has been stored for 24 hours (`increase(tt_model_artifacts_total{result="stored"}[24h]) == 0`).
