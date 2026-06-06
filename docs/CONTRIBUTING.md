# Contributing to AI Trading Platform

Thank you for your interest in contributing. This document outlines the conventions and standards for the project.

## Quick Start

```bash
git clone <repo>
cd trading-model
npm install
npm run build
npm test
```

## Code Organization

The project is an npm workspaces monorepo:

```
trading-model/
├── packages/     # Shared libraries (@trading-model/*)
│   └── lib/      # Common utilities, types, middleware
├── services/     # Microservices (kebab-case directory names)
│   └── <service>/
│       ├── src/
│       │   ├── app/           # Entry points & routes
│       │   ├── config/        # Environment & app config
│       │   ├── core/          # Business logic (services, repositories)
│       │   ├── controllers/   # HTTP controllers
│       │   ├── middleware/    # Express middleware
│       │   └── types/         # Type definitions
│       ├── tests/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── e2e/
│       └── docs/
├── docs/         # Centralized documentation
└── scripts/      # Automation scripts
```

## Naming Conventions

| Element               | Convention           | Example                |
| --------------------- | -------------------- | ---------------------- |
| Directories           | kebab-case           | `discovery-server/`    |
| Files                 | kebab-case           | `address-manager.ts`   |
| Classes & Types       | PascalCase           | `class AddressManager` |
| Variables & Functions | camelCase            | `const addressManager` |
| Constants             | SCREAMING_SNAKE_CASE | `DEFAULT_TIMEOUT`      |
| Test files            | `.spec.ts` only      | `user.service.spec.ts` |

File suffixes: `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.middleware.ts`, `*.util.ts`, `*.spec.ts`

## Code Style

- **Formatter**: Prettier with `printWidth: 100`, `singleQuote`, `trailingComma: "es5"`, `arrowParens: "avoid"`
- **Linter**: ESLint with TypeScript strict rules
- **TypeScript**: `strict: true`, target ES2020

### Import Order

1. Node built-ins (`fs`, `path`)
2. External deps (`express`, `zod`)
3. Internal absolute (`@lib/*`)
4. Internal relative (`../controllers/`)
5. Side effects (`import './setup'`)

## Testing

- **Framework**: Jest with `ts-jest`
- **Convention**: Single `.spec.ts` suffix
- **Coverage threshold**: 100% minimum (branches, functions, lines, statements)
- **Structure**: Tests mirror source under `tests/unit/`, `tests/integration/`, `tests/e2e/`

All code should include tests before being considered complete.

## Git Workflow

### Commit Messages (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

Examples:

```
feat(auth): add JWT token validation
fix(scraper): handle missing data fields
refactor(core): extract token validation logic
```

### Branching

- `main` — stable, release-ready
- `development` — integration branch for PRs
- Feature branches from `development` (or `main` for hotfixes)
- Use descriptive kebab-case names

## Standards Reference

For the full set of conventions (dependency injection, error handling, configuration, environment variables, CI/CD, architecture patterns), see [STANDARDS.md](./STANDARDS.md).

## License

By contributing, you agree that your contributions are licensed under the same license as this project.
