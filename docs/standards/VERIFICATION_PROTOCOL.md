# Verification Protocol

## Why

Every change — from a single commit to a full release — carries risk. This protocol defines the mandatory verification steps at each stage of the development lifecycle to catch issues early and ensure quality.

## Before Every Commit

| #   | Check                                 | How                                                         |
| --- | ------------------------------------- | ----------------------------------------------------------- |
| 1   | Staged changes are intentional        | `git diff --cached` — review before committing              |
| 2   | No secrets or credentials in the diff | Grep for tokens, passwords, private keys                    |
| 3   | Commit message follows COMMIT.md      | `<gitmoji>(<scope>): <subject>` format                      |
| 4   | No debug / commented code left behind | `console.log`, `debugger`, `TODO`, `FIXME`                  |
| 5   | Pre-commit hooks pass                 | Biome formatting + lint, commitlint (enforced by husky) |

## Before Every PR

| #   | Check                                      | How                                                        |
| --- | ------------------------------------------ | ---------------------------------------------------------- |
| 1   | Branch is up to date with base             | `git merge <base>` (e.g. `development`)                    |
| 2   | Lint passes (0 errors)                     | `npm run lint`                                             |
| 3   | Build succeeds                             | `npm run build`                                            |
| 4   | All tests pass                             | `npm run test:coverage`                                    |
| 5   | New code has test coverage                 | At least 80% for new/modified code                         |
| 6   | PR description follows PR.md template      | Include type of change, additions, modifications, removals |
| 7   | No breaking changes without migration path | Document in PR body                                        |
| 8   | Labels are set                             | `enhancement`, `bug`, `refactor`, `docs`, etc.             |
| 9   | Target branch is correct                   | Feature → `development`, Release → `main`                  |

## During PR Review

| #   | Check                                          | Who       |
| --- | ---------------------------------------------- | --------- |
| 1   | CI checks pass (lint, build, test)             | Automated |
| 2   | Code follows project conventions               | Reviewer  |
| 3   | Naming, structure, style comply with standards | Reviewer  |
| 4   | Test coverage is adequate                      | Reviewer  |
| 5   | No regressions introduced                      | Reviewer  |
| 6   | Architectural relevance is maintained          | Reviewer  |
| 7   | All reviewer comments are resolved             | Author    |
| 8   | At least 1 approval obtained                   | Reviewer  |

## Before Every Release

| #   | Check                                                | How                                                          |
| --- | ---------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `development` branch is healthy                      | Latest CI green on development                               |
| 2   | All PRs for this release are merged into development | `git log main..development --oneline`                        |
| 3   | `main` is up to date locally                         | `git checkout main && git pull`                              |
| 4   | Dependabot PRs are reviewed and merged               | Check open PRs labelled `dependencies`                       |
| 5   | CHANGELOG reflects all changes                       | Review with `git log` if needed                              |
| 6   | Version bump type is correct                         | `--bump major/minor/patch` or `--version x.y.z`              |
| 7   | `GHCR_TOKEN` secret is configured in repo            | `https://github.com/<owner>/<repo>/settings/secrets/actions` |

## During Release

| #   | Step                                 | Command                                                              |
| --- | ------------------------------------ | -------------------------------------------------------------------- |
| 1   | Ensure on `main` branch              | `git checkout main`                                                  |
| 2   | Merge `development` into `main`      | `git merge development`                                              |
| 3   | Run release script                   | `npm run release` or `npm run release:dry` to preview                |
| 4   | Or run full automated publish        | `npm run release:publish` (merges, bumps, commits, tags, pushes)     |
| 5   | Verify CI release workflow triggered | Check Actions tab: tag push triggers `.github/workflows/release.yml` |
| 6   | Monitor Docker build and push        | `quality` → `docker` → `release` jobs must all pass                  |
| 7   | Verify GitHub Release created        | Check Releases page on GitHub                                        |

## After Release

| # | Check | How |
| --- | ------------------------------------ | ----------------------------------------------------------------- | ------- |
| 1 | Docker images are published to GHCR | `docker pull ghcr.io/<owner>/<repo>/<service>:<version>` |
| 2 | GitHub Release has correct notes | Check release page |
| 3 | Tag exists and is pushed | `git tag -l                                                       | grep v` |
| 4 | `development` is synced with `main` | `git checkout development && git merge main` |
| 5 | Deploy to production (if applicable) | `IMAGE_TAG=<version> docker compose pull && docker compose up -d` |
| 6 | Smoke test production endpoints | `curl -k https://<host>:<port>/ping` |
| 7 | Monitor logs for errors | `docker compose logs -f --tail=100` |

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                    Verification Flow                         │
├──────────────┬──────────────┬───────────────┬───────────────┤
│  Before      │  Before      │  During       │  After        │
│  Commit      │  PR          │  Release      │  Release      │
├──────────────┼──────────────┼───────────────┼───────────────┤
│ • diff       │ • lint       │ • main        │ • images      │
│ • secrets    │ • build      │   checkout    │   published   │
│ • format     │ • test       │ • merge dev   │ • release     │
│ • hooks      │ • coverage   │ • bump        │   created     │
│              │ • template   │ • tag         │ • sync dev    │
│              │ • labels     │ • push        │ • deploy      │
│              │ • target     │ • CI watch    │ • smoke test  │
└──────────────┴──────────────┴───────────────┴───────────────┘
```

## References

- [COMMIT.md](./COMMIT.md) — Commit conventions
- [PR.md](./PR.md) — Pull request standards
- [CI_CD.md](./CI_CD.md) — CI/CD pipelines
- [QUALITY.md](./QUALITY.md) — Quality thresholds
- [TESTING.md](./TESTING.md) — Testing standards
