# Multi-Region Deployment

**Not supported.** The platform runs in one region: one discovery Service in
front of every discovery-server replica, one Redis (sentinels in K8s,
ADR-0023), one MySQL and one MongoDB per store (ADR-0020).

An earlier version of this page described a cross-region setup driven by
`ADDRESS_MANAGER_URLS` (a list of discovery URLs tried in turn) and
`REDIS_KEY_PREFIX` (a registry prefix per region). No deployment ever set
either: `REDIS_KEY_PREFIX` was read by no code, and the multi-URL failover in
address-manager was removed with the other configuration that nothing turned on
(ADR-0029, `bun run config:check`).

## Disaster recovery without a second region

A lost region is recovered by redeploying the overlays in another one and
restoring the encrypted off-site backups: see [BACKUP_DR.md](BACKUP_DR.md) and
the restore drills (`tests/k8s/run-kind.sh`, `tests/backup/compose-restore-drill.sh`).

## What a second region would need

A new ADR, and at least:

- a discovery URL per region in address-manager, with a failover policy that a
  deployment profile actually sets (`config:check` fails otherwise);
- a registry that knows instance regions (today discovery keys are global,
  `trading-model:discovery:*`);
- a decision on MySQL, MongoDB and Redis replication across regions, and on
  where the audit chain (ADR-0027) is anchored.
