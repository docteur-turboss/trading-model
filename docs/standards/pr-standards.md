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
docs/api-endpoints-messages
chore/update-typescript-6
```

## PR Template

A PR template exists at `.github/PULL_REQUEST_TEMPLATE.md`. GitHub uses this template automatically when creating a PR.

## Required Checks

Before a PR can be merged, it must pass all of the following checks:

| Check     | Command                 | Trigger   |
| --------- | ----------------------- | --------- |
| **Lint**  | `bun run lint`          | Push / PR |
| **Build** | `bun run build`         | Push / PR |
| **Test**  | `bun run test:coverage` | Push / PR |

These checks run automatically via GitHub Actions in `.github/workflows/ci.yml`.

## Review

- **At least 1 approval required** to merge
- Reviewers must verify:
  - Compliance with project standards (naming, structure, style)
  - Test coverage
  - No regressions
  - Architectural relevance
  - **No swallowed errors** ([Error Handling](./error-handling.md)): every `catch` propagates, logs/records a metric or delegates; no infrastructure failure returned as `[]`/`0`/`null`/`false`; no success log that ignores a failed result; each `biome-ignore lint/plugin` has a valid reason
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

## References

- [Commit Standards](./commit-standards.md) — Commit message format
- [CI/CD](../ci-cd/README.md) — CI/CD workflows
- `.github/PULL_REQUEST_TEMPLATE.md` — PR template
