# Quality Standards

## Why

Guarantee that code is production-ready, maintainable over time, and respects the standards defined by the team. Quality is a shared responsibility — every commit must pass the same quality barriers.

## Tools

| Tool           | Usage                      | Configuration                 |
| -------------- | -------------------------- | ----------------------------- |
| **Biome**     | Static code analysis + formatting | `biome.json`           |
| **Biome**      | Automatic formatting + lint | `biome.json`                  |
| **Jest**       | Unit and integration tests | `jest.config.js` (per module) |
| **TypeScript** | Type checking              | `tsconfig.json` (per module)  |
| **commitlint** | Commit message validation  | `.commitlintrc`               |
| **Husky**      | Git hooks                  | `.husky/`                     |

## Quality Gates

### Pre-commit (Husky)

Triggered on every `git commit` — fast, must pass in seconds:

```bash
# .husky/pre-commit
bunx lint-staged
```

`lint-staged` applies `@biomejs/biome` only to modified files.

### Pre-push (Husky)

Triggered on every `git push` — more thorough:

```bash
# .husky/pre-push
bun run build
bun run test
```

### CI (GitHub Actions)

Triggered on every push and PR — full validation:

```bash
bun run lint
bun run build
bun run test:coverage
```

## Linting

- **0 Biome errors** — No tolerance in CI
- **Warnings** — Tolerated short-term but must trend toward 0
- Linting covers all `.ts`, `.js`, `.mjs`, `.cjs` files
- Test files (`.spec.ts`) and fixtures are excluded from linting

```bash
bun run lint  # bunx @biomejs/biome check .
```

### Biome Configuration

Configuration at root `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

Import order enforced via Biome's `organizeImports` (see `biome.json`).

## Test Coverage

See [Testing Standards](./testing-standards.md) for the complete test coverage thresholds per module, configuration template, and test patterns.

## TypeScript Strict

All modules use strict TypeScript configuration:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Strict rules enabled:

- **`strict: true`** — Enables all strict checks
- **`noImplicitAny`** — Forbids implicit `any` types
- **`strictNullChecks`** — `null` and `undefined` must be handled explicitly
- **`forceConsistentCasingInFileNames`** — Case consistency in imports

## Dependencies

- **bun audit** — Run regularly: `bun audit`
- **Dependabot** — Enabled on the repository, automatic PRs
- **Dependabot PR review** — Priority, merge quickly
- **No dependencies with known vulnerabilities** in production
- **Update dependencies via commits with scope `deps`**:
  ```
  :arrow_up:(deps): update express to 5.2.1
  ```

## Pre-merge Checklist (PR)

Before merging a PR, verify:

- [ ] `bun run lint` — 0 errors
- [ ] `bun run build` — Build succeeded
- [ ] `bun run test` — All tests pass
- [ ] `bun run test:coverage` — Coverage thresholds met
- [ ] Code review approved (>= 1 approval)
- [ ] No secrets committed
- [ ] Compliance with naming and structure standards

## References

- [Testing Standards](./testing-standards.md) — Test framework, structure, coverage thresholds, patterns
- [CI/CD](../ci-cd/README.md) — CI/CD pipeline
- [Code Style](./code-style.md) — Code writing standards
- [Commit Standards](./commit-standards.md) — Commit message validation
