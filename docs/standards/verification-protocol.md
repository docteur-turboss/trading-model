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

## Before Merging to Development

| #   | Check                                            | How                                          |
| --- | ------------------------------------------------ | -------------------------------------------- |
| 1   | At least 1 approval from maintainers              | GitHub protected branch rule                 |
| 2   | All conversations resolved                        | GitHub UI                                    |
| 3   | All CI checks green                               | CI pipeline (ci.yml)                         |
| 4   | Migration scripts included if schema changes      | Review                                        |
| 5   | Documentation updated if API / behaviour changed  | Review                                        |
| 6   | CHANGELOG entry added                             | `npm run release` (manual)                    |
| 7   | Branch is up to date with `development`           | `git merge development`                       |
| 8   | Squash & merge strategy                           | No merge commits on development               |

## Before Creating a Release Tag

| #   | Check                                            | How                                          |
| --- | ------------------------------------------------ | -------------------------------------------- |
| 1   | All features are merged to `development`          | GitHub PR list                               |
| 2   | `development` has been deployed and verified      | Beta deployment + canary check               |
| 3   | Version bumped                                    | `npm run release` (updates package.json)     |
| 4   | CHANGELOG generated                               | `npm run release` (auto-generates)           |
| 5   | Breaking changes documented                       | CHANGELOG footer section                     |
| 6   | `development` merged to `main`                    | `git checkout main && git merge development` |
| 7   | Tag created                                       | `git tag v*.*.*`                             |

## Before Deploying to Production

| #   | Check                                            | How                                          |
| --- | ------------------------------------------------ | -------------------------------------------- |
| 1   | Release tag pushed                                | Triggers `release.yml`                       |
| 2   | Docker images built and pushed to GHCR            | Check GitHub Actions                         |
| 3   | GitHub Release created with changelog             | Automated                                    |
| 4   | Deployment initiated by operator                  | `docker compose pull && docker compose up -d` |
| 5   | Smoke tests pass                                  | Health endpoints + E2E tests                 |

## Quality Gates Summary

| Gate               | Enforced by              | Blocks              | Documentation                                      |
| ------------------ | ------------------------ | ------------------- | -------------------------------------------------  |
| Code style         | Biome (linter + formatter) | CI                | [Code Style](code-style.md)                        |
| Commit format      | commitlint (husky)        | Push               | [Commit Standards](commit-standards.md)            |
| Build              | TypeScript compiler       | CI                 | —                                                  |
| Unit tests         | Jest                      | CI                 | [Testing Standards](testing-standards.md)          |
| Coverage thresholds| Jest                      | CI                 | [Testing Standards](testing-standards.md)          |
| PR review          | GitHub protected branches | Merge              | [PR Standards](pr-standards.md)                    |
| Security audit     | `npm audit`               | CI                 | [Security](../security/README.md)                  |

## Related

- [CI/CD Pipeline](../ci-cd/README.md) — Automated quality checks
- [Commit Standards](commit-standards.md) — Commit format requirements
- [Pull Request Standards](pr-standards.md) — PR guidelines
