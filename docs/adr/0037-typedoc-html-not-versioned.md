# ADR-0037: Generated TypeDoc HTML Is Not Versioned

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md)
**Verified by:** `bun run adr:check`

## Context

601 TypeDoc HTML files were committed under `docs/architecture/code/`, with `media/*.md` copies of service READMEs and ARCHITECTURE files that drifted from their sources (ESLint, `createSecureServer` from common, Trader-Executor). They showed up in searches with false content. `release.yml` does not publish TypeDoc, so nothing regenerated them (audit documentation 2026-11-03, m6, issue #375).

## Decision

1. `docs/architecture/code/` is no longer tracked and is listed in `.gitignore`.
2. `bun run docs:generate` still builds it locally from the sources; nothing publishes it.
3. No CI artifact or GitHub Pages for now: add one in a new ADR if the HTML must be browsable online.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Regenerate and add a gate failing on diff | 600 files of churn on every doc change, TypeDoc output not byte-stable across versions |
| Publish in CI (artifact or Pages) | No consumer today; can be added later |
