# Quality Standards

## Why

Guarantee that code is production-ready, maintainable over time, and respects the standards defined by the team. Quality is a shared responsibility — every commit must pass the same quality barriers.

## Tools

| Tool           | Usage                      | Configuration                 |
| -------------- | -------------------------- | ----------------------------- |
| **ESLint**     | Static code analysis       | `eslint.config.mjs`           |
| **Prettier**   | Automatic formatting       | `.prettierrc`                 |
| **Jest**       | Unit and integration tests | `jest.config.js` (per module) |
| **TypeScript** | Type checking              | `tsconfig.json` (per module)  |
| **commitlint** | Commit message validation  | `.commitlintrc`               |
| **Husky**      | Git hooks                  | `.husky/`                     |

## Quality Gates

### Pre-commit (Husky)

Triggered on every `git commit` — fast, must pass in seconds:

```bash
# .husky/pre-commit
npx lint-staged
```

`lint-staged` applies Prettier and ESLint only to modified files.

### Pre-push (Husky)

Triggered on every `git push` — more thorough:

```bash
# .husky/pre-push
npm run build
npm test
```

### CI (GitHub Actions)

Triggered on every push and PR — full validation:

```bash
npm run lint
npm run build
npm run test:coverage
```

## Linting

- **0 ESLint errors** — No tolerance in CI
- **Warnings** — Tolerated short-term but must trend toward 0
- Linting covers all `.ts`, `.js`, `.mjs`, `.cjs` files
- Test files (`.spec.ts`) and fixtures are excluded from linting

```bash
npm run lint  # npx eslint . --ext .ts,.js,.mjs,.cjs
```

### ESLint Configuration

```javascript
// eslint.config.mjs - ROOT CONFIG (flat config, shared across monorepo)
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { globalIgnores, defineConfig } from 'eslint/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  tseslint.configs.recommended,
]);
```

Ignored files: `**/dist/**`, `**/*.spec.ts`, `**/jest.config.*`, `**/jest.setup.ts`, `**/setup.ts`, `**/tests/fixtures/**`, `**/tests/helpers/**`

## Test Coverage

Minimum thresholds defined per module (see [TESTING.md](./TESTING.md) for details):

| Module                         | Threshold |
| ------------------------------ | --------- |
| @trading-model/common          | 100%      |
| discovery-server               | 100%      |
| message-manager                | 100%      |
| financial-scraper              | 100%      |
| @trading-model/address-manager | 80%       |
| @trading-model/broker-message  | 80%       |
| trader-trainer                 | Not set   |

Coverage is verified by Jest on every test run. Below the threshold, tests fail.

### Global jest.config.js template

```javascript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec|test).[tj]s'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
```

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

- **npm audit** — Run regularly: `npm audit`
- **Dependabot** — Enabled on the repository, automatic PRs
- **Dependabot PR review** — Priority, merge quickly
- **No dependencies with known vulnerabilities** in production
- Update dependencies via commits with scope `deps`:
  ```
  :arrow_up:(deps): update express to 5.2.1
  ```

## Pre-merge Checklist (PR)

Before merging a PR, verify:

- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — Build succeeded
- [ ] `npm test` — All tests pass
- [ ] `npm run test:coverage` — Coverage thresholds met
- [ ] Code review approved (>= 1 approval)
- [ ] No secrets committed
- [ ] Compliance with naming and structure standards

## References

- [TESTING.md](./TESTING.md) — Detailed coverage thresholds
- [CI_CD.md](./CI_CD.md) — CI/CD pipeline
- [WRITING.md](./WRITING.md) — Code writing standards
- [COMMIT.md](./COMMIT.md) — Commit message validation
