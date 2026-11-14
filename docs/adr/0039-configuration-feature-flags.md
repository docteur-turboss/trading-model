# ADR-0039: Configuration Feature Flags

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0016](./0016-shared-contracts-ownership.md), [ADR-0025](./0025-ga-fitness-wired-to-fitness-type.md)
**Verified by:** `packages/validation/tests/feature-flags.spec.ts`, `services/trader-trainer/tests/unit/config/fitness-flag.spec.ts`, `bun run config:check`

## Context

No way to turn a risky behaviour on or off without a new image (audit deploiement 2026-11-05, M9, issue #426). The only "flag" was the `FEATURE_FLAGS` of `deploy-k8s.sh`, unrelated to the application.

## Decision

1. **A flag is a boolean environment variable named `FEATURE_<NAME>`**, declared in the Zod env schema of the service that reads it with `featureFlag(default)` (`@trading-model/validation/config/feature-flags`, a thin `z.stringbool().default(...)`). An invalid value fails `validateEnv` at startup. No flag service, no percentage rollout.
2. **Scope.** Only the service that owns the behaviour reads its flag. Flags turn a behaviour off (fallback switches): the default is the normal behaviour, the deployment sets the flag in `deploy/k8s/config/<service>.properties`, `docker-compose.yml`, `.env.example` and `docs/deployment/ENV.md` (`config:check` fails otherwise). They are not trading kill switches: no emergency stop of orders exists (see `docs/compliance/algorithmic-trading-compliance.md`).
3. **Lifetime.** A flag is removed (code branch, env var, doc row) once its behaviour has run stable in production for two releases, or when the behaviour is dropped. Remove it in the same change as the dead branch.
4. **First flag: `FEATURE_RISK_ADJUSTED_FITNESS`** (trader-trainer, default `true`). `false` forces the GA fitness to `total_pnl` whatever `TRAINER_FITNESS_TYPE` is (ADR-0025).
5. **Not covered:** the market data source (`BINANCE_BASE_URL` already switches it, ADR-0026). A flag changes in `deploy/k8s/config/<service>.properties` and ships through `deploy.yml`: the ConfigMap is hashed (`<service>-config-<hash>`, issue #410), so the new name changes the pod template and rolls the Deployment.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| External flag service (Unleash, LaunchDarkly) | Infrastructure and dependency out of proportion for 7 services |
| New parser in `common` | `validation` already owns the env schemas |
| Runtime-reloadable flags | Needs a watcher; a restart through the rollout is enough |

## Consequences

- A risky behaviour is cut by editing the properties file and deploying, without an image; the hashed ConfigMap rolls the Deployment.
- Each flag adds a branch to test and a removal date to honour.
