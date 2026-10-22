---
type: etat
domaine: monorepo
maj: 2026-10-13
tags: [state, memory, architecture, verification]
statut: actif
---

# État du système (STATE.md)

> **Mémoire canonique du dépôt.** La fenêtre de contexte d'un agent est du travail
> en cours, pas de la mémoire. Le dépôt EST la mémoire : cette page est sa carte.
> Elle est relue à chaque démarrage à froid — par un humain comme par un agent.

## Ce que c'est

`trading-model` est un monorepo de trading algorithmique : 12 packages partagés
(scopés `@trading-model/*`) + 8 microservices, liés par bun workspaces.

- **Packages** : primitives, contracts, reliability, common, persistence, http, validation, server-utils, crypto, jobs, address-manager, broker-message
- **Services** : message-manager, discovery-server, financial-scraper, trader-trainer (nom de package : `trader-service`), api-gateway, audit-logger, dlq-service, admin-interface (SPA React/Vitest)
- **Données** : MySQL (financial-scraper, datastore SPIRE), MongoDB (audit-logger, dlq-service), Redis (message-manager)
- **Identité/mTLS** : SPIRE/SPIFFE (ADR-0011) — obligatoire en Docker et K8s
- **Version courant** : `2.0.3` — release via GitHub Actions (workflow `Release`)

## Invariants non négociables

1. Build ordonné : les 12 packages dans l'ordre de dépendance (voir `AGENTS.md`), puis les services.
2. Couverture de tests ≥ 80 % (branches fonction-lignes), seuils dérogatoires versionnés.
3. Qualité : lint (Biome 0 erreur) et tests verts avant tout push — voir `docs/ci-cd/README.md`.
4. Numérotation des migrations SQL ascendante ; journaux append-only.
5. Aucun secret en clair dans le dépôt (env vars / secrets scellés).

## Protocole de démarrage à froid (cold-start)

Ordre de lecture imposé — ne jamais tout lire d'un coup :

1. `AGENTS.md` — commandes, layout, pièges (trader-trainer ≠ trader-service, admin-interface ≠ Jest).
2. **Ce fichier** (`docs/STATE.md`) — la carte.
3. Uniquement ensuite : `docs/standards/*`, la doc du service concerné (`docs/services/*`), les ADRs (`docs/adr/`), les specs (`docs/spec/SPEC-*.md`).
4. Les tests comme mémoire exécutable : casser un test doit être une découverte, pas une surprise.

## Liens

- [[README]] — entrée racine
- [[docs/standards/README]] — standards qualité
- [[docs/ci-cd/README]] — pipeline CI/CD
- [[docs/adr/README]] — décisions d'architecture
- [[docs/spec/TEMPLATE]] — gabarit de spec (exigences traçables)