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
- **Automated drills**: the restore drills of CI (`k8s` job of `ci.yml`,
  `tests/k8s/run-kind.sh` `verify_backup`; weekly `backup-test.yml`,
  `tests/backup/compose-restore-drill.sh`). They run on every push or every
  week and publish their timings themselves (job summary and the artifact
  `restore-drill-timings-kind` / `restore-drill-timings-docker`, file
  `restore-drill-timings.json`). They are **not** logged one by one here. Log
  one when the timings change the picture: a budget exceeded, a step that
  doubled, a trend worth a decision. The market-data dumps are not purged
  (data retention is a separate work item), so `restore_mysql` and
  `fetch_offsite` should be read as a trend, run after run.

### What the automated drills measure and compare

| Drill | Steps in `restore-drill-timings.json` (seconds) | Default budget |
|---|---|---|
| kind | `backup_daily`, `backup_incremental`, `disaster`, `fetch_offsite`, `restore_mongodb`, `restore_mysql`, `restore_checkpoints`, `restore_spire`, `restore_total` (per-component values logged by `restore-k8s.sh`), `restore_total_host`, `verify_data`, `spire_agents_reattest`, `verify_services`; then `total_seconds` and `recovery_seconds` | 5400 s |
| Docker | `backup`, `recreate_empty_stack`, `restore`, `verify_data`; then `total_seconds` and `recovery_seconds` | 1800 s |

`recovery_seconds` runs from the moment the data is destroyed to the end of the
checks: it is the figure the budget (`RESTORE_DRILL_BUDGET_SECONDS`) limits.
`RESTORE_DRILL_BUDGET_MODE=fail` (default) fails the drill when it is exceeded,
`warn` only emits a `::warning::`; `RESTORE_DRILL_BUDGET_SECONDS=0` turns the
check off. The budgets are wide on purpose: kind on a shared CI runner is much
slower than production and sized differently, and the drill includes waiting
for the writers to drain (up to 7 minutes). They catch a drill that blows up
(an unbounded dump, a hung step), not a drift of a few minutes. The RTO itself
is judged on a real exercise, below.

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
| Restore MySQL (market data, SPIRE datastore) | | | |
| Restore SPIRE CA keys | | | |
| Restore checkpoints | | | |
| Checks (data, audit chain, mTLS) | | | |
| Services back (tier T1 / T2 / T3) | | | |
| **Total** | | RTO of the tier / data store | |

- **RTO gap:** met / exceeded by …, which step.
- **RPO gap:** data lost between the last backup or archive and the incident (hours), against the RPO of the data store.
- **Deviations:** what did not go as the runbook says.
- **Actions:** each with an owner and a date or issue number.
```

## Entries

### 2026-11-03 — Automated timings introduced (issue #329)

| Field | Value |
|---|---|
| **Type** | Automated drill |
| **Environment** | kind (`ci.yml`, job `k8s`) and Docker (`backup-test.yml`) |
| **Scenario** | Both drills now time every step and compare the recovery window with a budget |

No duration is recorded here: the first figures are in the artifacts of the
first CI run after this change. **Action:** copy the `restore-drill-timings.json`
of that run into a first reference entry, and adjust the default budgets of
`tests/k8s/run-kind.sh` / `tests/backup/compose-restore-drill.sh` (or
`RESTORE_DRILL_BUDGET_SECONDS` in the workflow) if they are far off.

No annual tabletop exercise or full recovery drill has been recorded yet; the
Business Continuity Policy declares them (§ 7). The first one is an
organisational task (owner: Platform Security Lead) and starts a new entry
above this one.
