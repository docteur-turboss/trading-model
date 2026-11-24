# DR Exercise Log

| Field | Value |
|---|---|
| **Document owner** | Platform Security Lead |
| **Purpose** | Versioned record of every disaster-recovery exercise and restore drill: when, which scenario, how long each step took, and how that compares with the RTO / RPO |
| **Policy** | [Business Continuity Policy](business-continuity-policy.md) § 7 (annual tabletop exercise and full recovery drill) |
| **Targets** | [BACKUP_DR.md](../deployment/BACKUP_DR.md) (data-store RTO / RPO) and [Business Continuity Policy](business-continuity-policy.md) § 2.2 (service-tier RTO) |

Add one entry per exercise, newest first, in the pull request that follows it.
Never edit a past entry: add a correction under it.

## Two kinds of entries

- **Annual exercises** (tabletop, full recovery drill): organisational, run by
  people on a real or production-like environment. Durations are those of the
  exercise, compared with the RTO of the tier / data store involved.
- **Automated drills**: the restore drill of CI (`k8s` job of `ci.yml`,
  `tests/k8s/run-kind.sh` `verify_backup`). It runs on pull
  requests touching databases, backups or their services and on every release;
  It publishes its timings itself (job summary and the artifact
  `restore-drill-timings-kind`, file
  `restore-drill-timings.json`). They are **not** logged one by one here. Log
  one when the timings change the picture: a budget exceeded, a step that
  doubled, a trend worth a decision. The market-data dumps are not purged
  (data retention is a separate work item), so `restore_mysql` and
  `fetch_offsite` should be read as a trend, run after run.

What the drills measure, their steps and budget: [BACKUP_DR.md](../deployment/BACKUP_DR.md#backup-verification-cicd).

## Entry template

```markdown
### YYYY-MM-DD — <scenario>

| Field | Value |
|---|---|
| **Type** | Tabletop / Full recovery drill / Automated drill (budget exceeded, trend…) |
| **Environment** | production-like / staging / kind / Docker |
| **Participants** | roles |
| **Scenario** | what was lost (e.g. total loss of the cluster; one MongoDB replica set; SPIRE volume), starting state |
| **Data restored from** | backup run `<timestamp>`, off-site bucket, point in time `<instant>` or latest |

| Step | Duration | Target | Gap |
|---|---|---|---|
| Detection and decision | | | |
| Fetch from the off-site bucket | | | |
| Restore MongoDB (audit, dlq) | | | |
| Restore MySQL (market data) | | | |
| Restore SPIRE datastore and CA keys | | | |
| Restore checkpoints | | | |
| Restore risk-execution state | | | |
| Checks (data, audit chain, mTLS) | | | |
| Services back (tier T1 / T2 / T3) | | | |
| **Total** | | RTO of the tier / data store | |

- **RTO gap:** met / exceeded by …, which step.
- **RPO gap:** data lost between the last backup or archive and the incident (hours), against the RPO of the data store.
- **Deviations:** what did not go as the runbook says.
- **Actions:** each with an owner and a date or issue number.
```

## Entries

### 2026-11-03 — First automated timings (issue #329)

| Field | Value |
|---|---|
| **Type** | Automated drill |
| **Environment** | kind (`ci.yml`, job `k8s`, run 41643357917), GitHub-hosted runner |
| **Scenario** | The drill times every step: audit and dlq databases, markers, `market_candles` and the SPIRE server volume destroyed, restored from the in-cluster S3 to an instant |
| **Data restored from** | the backup run of the drill (kind: daily dump plus incremental archives, `--until` the recorded instant) |

kind (seconds):

| Step | Duration |
|---|---|
| `backup_daily` | 19 |
| `backup_incremental` | 14 |
| `disaster` | 74 |
| `fetch_offsite` | 1 |
| `restore_mongodb` | 4 |
| `restore_mysql` | 2 |
| `restore_checkpoints` | 1 |
| `restore_spire` | 60 |
| `restore_total` | 67 |
| `verify_data` | 9 |
| `spire_agents_reattest` | 13 |
| `verify_services` | 46 |
| **total** | 722 |
| **recovery (disaster to checks)** | 252 |

- **RTO gap:** none. 252 s against the 4 h data-store RTO of
  [BACKUP_DR.md](../deployment/BACKUP_DR.md). Not representative: kind on a
  shared runner, a few MB of data, no real off-site latency, and the market-data
  dump is not purged, so `restore_mysql` and `fetch_offsite` will grow. The
  largest step is `restore_spire` (60 s).
- **RPO gap:** not measured by this drill beyond the instant restored to.
- **Deviations:** none.
- **Actions:** default budgets set from these figures (1200 s, see above); read `restore_mysql` and `fetch_offsite` as a trend in
  later runs.

No annual tabletop exercise or full recovery drill has been recorded yet; the
Business Continuity Policy declares them (§ 7). The first one is an
organisational task (owner: Platform Security Lead) and starts a new entry
above this one.
