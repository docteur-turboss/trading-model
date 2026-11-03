---
id: SPEC-001
title: Exemple d'exigence traçable
status: draft
owner: @team-member
domaine: services/api-gateway
maj: 2026-01-01
tags: [spec, template]
---

# SPEC-001 — Exemple d'exigence traçable

## Contexte

Pourquoi cette exigence existe, quel problème elle résout, quelle contrainte
technique la motive. Une spec n'est pas une description de code — c'est un
contrat de comportement vérifiable, **indépendant de l'implémentation**.

## Exigences

1. Le service refuse toute requête sans en-tête d'authentification valide (HTTP 401).
2. Les identifiants sont uniquement exposés dans les logs structurés, jamais en clair.
3. La latence p95 sous charge nominale ne dépasse pas 250 ms.

## Critères d'acceptation (oracle)

- [ ] Une requête sans token → 401, corps d'erreur normalisé.
- [ ] Un token expiré → 401 avec code `TOKEN_EXPIRED`.
- [ ] Aucun champ de secret présent dans les journaux (vérifié par le gate d'observabilité).

## Tests

- [ ] `services/api-gateway/tests/unit/auth.middleware.spec.ts`
- [ ] `services/api-gateway/tests/integration/auth-flow.integration.spec.ts`

> Règle : *un test qui passe avant l'implémentation ne teste rien*. Le test doit
> être rouge d'abord, vert ensuite — c'est la preuve qu'il encode l'exigence et
> pas l'implémentation.

## Liens

- [[docs/STATE.md]]