# Contributing

Thank you for your interest. This document outlines what you need to know
before contributing code.

For the **full dev-to-prod workflow** (from checkout → commit → PR → release →
deploy), see [`WORKFLOW.md`](./WORKFLOW.md).

For **coding standards** (naming, formatting, architecture patterns, commit
conventions), see [`STANDARDS.md`](./STANDARDS.md).

---

## Quick start (first-time setup)

```bash
git clone <repo>
cd trading-model
npm ci
npm run build
npm test
```

To run the full stack locally, see [`QUICKSTART.md`](./QUICKSTART.md).

---

## What you need to know

| Topic | Where to find it |
|---|---|
| Dev workflow, commit, PR, release | [`WORKFLOW.md`](./WORKFLOW.md) |
| Code style, naming, ESLint, Prettier | [`STANDARDS.md`](./STANDARDS.md) |
| Architecture, dependency graph | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Testing conventions | [`TESTING.md`](./TESTING.md) |
| Database schema | [`database-models.md`](./database-models.md) |
| API endpoints | [`API.md`](./API.md) |

---

## Branching

- **`dev`** — branche de défaut, déploiement **beta**
- **`main`** — stable, release-ready (validé après quelques jours en beta)
- Feature branches depuis `dev`, kebab-case (`feat/my-thing`)
- **Hotfix** (urgent) : depuis `main`, merger directement sur `main` (`hotfix/xxx`)
- Les PRs sont mergées dans `dev` via **Squash & Merge**
- Une fois la beta validée (peu d'erreurs après quelques jours) → merger `dev` dans `main`
- Si trop d'erreurs → redéployer `main` comme version beta

## License

By contributing, you agree that your contributions are licensed under the same
license as this project.
