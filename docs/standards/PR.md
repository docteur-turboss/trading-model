# Pull Request Standards

## Why

Pull requests are the primary quality control checkpoint of the project. A well-structured PR accelerates review, guarantees traceability of changes, and lets CI act as a safety net.

## Target Branch

| Branch        | Usage                                           |
| ------------- | ----------------------------------------------- |
| `development` | Integration branch for feature branches         |
| `main`        | Release branch — merges from `development` only |

- **Feature branches** (feature, fix, refactor, etc.) must merge into `development`
- **Releases** are merged from `development` to `main`
- **Hotfixes** may merge directly to `main` in emergencies, then be cherry-picked to `development`

## Branch Naming

```
feature/<description>
fix/<description>
refactor/<description>
docs/<description>
chore/<description>
```

Examples:

```
feature/token-refresh-mechanism
fix/missing-fields-scraper
refactor/extract-validation-logic
docs/api-endpoints-discovery
chore/update-typescript-6
```

## PR Template

A PR template exists at `.github/PULL_REQUEST_TEMPLATE.md`. GitHub uses this template automatically when creating a PR.

```markdown
# Description

Briefly describe what this PR does.

## Type of Change

- [ ] :sparkles: feat — New feature
- [ ] :bug: fix — Bug fix
- [ ] :memo: docs — Documentation
- [ ] :recycle: refactor — Code restructuring
- [ ] :white_check_mark: test — Tests
- [ ] :wrench: chore — Configuration / tooling
- [ ] :construction_worker: ci — CI/CD
- [ ] :lock: security — Security

## Changes

### ✅ Additions

- ...

### :recycle: Modifications

- ...

### :fire: Removals

- ...

## Breaking Changes

- [ ] Yes (describe below)
- [ ] No

If yes, describe impact and migration:

## Tests

- [ ] Existing tests pass
- [ ] New tests added
- [ ] Manual tests performed

## Checklist

- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — Success
- [ ] `npm test` — All tests pass

## Closes Issues

Closes #<issue_number>

## Additional Notes

Any additional context useful for the reviewer.
```

## Required Checks

Before a PR can be merged, it must pass all of the following checks:

| Check     | Command                 | Trigger   |
| --------- | ----------------------- | --------- |
| **Lint**  | `npm run lint`          | Push / PR |
| **Build** | `npm run build`         | Push / PR |
| **Test**  | `npm run test:coverage` | Push / PR |

These checks run automatically via GitHub Actions in `.github/workflows/ci.yml`.

## Review

- **At least 1 approval required** to merge
- Reviewers must verify:
  - Compliance with project standards (naming, structure, style)
  - Test coverage
  - No regressions
  - Architectural relevance
- Comments must be constructive and specific
- The PR author must respond to each comment (resolution or discussion)
- Use **Squash & Merge** into `development`, then delete the branch

## Labels

| Label           | Usage                                 |
| --------------- | ------------------------------------- |
| `enhancement`   | New feature or improvement            |
| `bug`           | Bug fix                               |
| `documentation` | Documentation changes                 |
| `refactor`      | Restructuring without behavior change |
| `dependencies`  | Dependency updates                    |

## Example PR Description

```markdown
# Description

Centralize the `ServiceInstance` type in @trading-model/common to avoid
duplication between discovery-server and message-manager.

## Type of Change

- [x] :recycle: refactor — Code restructuring

## Changes

### ✅ Additions

- Type `ServiceInstance` in `packages/common/src/contracts/service-instance.type.ts`
- Unit tests for the new type

### :recycle: Modifications

- Discovery-server now imports from `@trading-model/common/contracts`
- Message-manager now imports from `@trading-model/common/contracts`
- Removed duplicate definitions in each service

### :fire: Removals

- `services/discovery-server/src/types/service-instance.ts`
- `services/message-manager/src/types/service-instance.ts`

## Breaking Changes

No — the type is identical, only the import path changes.

## Tests

- [x] Existing tests pass
- [x] New tests added for the centralized type
- [x] Manual tests performed (verified imports)

## Checklist

- [x] `npm run lint` — 0 errors
- [x] `npm run build` — Success
- [x] `npm test` — All tests pass

## Closes Issues

Closes #89

## Additional Notes

This PR is part of the shared type standardization initiative (#85).
```

## References

- [COMMIT.md](./COMMIT.md) — Commit standards (message format)
- [CI_CD.md](./CI_CD.md) — CI/CD workflows
- `.github/PULL_REQUEST_TEMPLATE.md` — PR template
