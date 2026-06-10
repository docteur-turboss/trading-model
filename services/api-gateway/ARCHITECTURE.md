# Architecture — api-gateway

Point d'entrée unique externe du système. Route, authentifie, limite et proxyfie toutes les requêtes entrantes vers les services internes.

## Fonctionnement

```
Client → /v1/{service}/... → API Gateway → auth → rate-limit → resolve Discovery → proxy mTLS → service
```

- **Routage versionné** : `/v{major}/{serviceName}/**` → résolution via Discovery Server, filtrage par version majeure
- **Auth** : header `x-api-key` ou `authorization`, validation contre liste configurable via `AUTH_TOKENS`
- **Rate limiting** : `express-rate-limit`, configurable (default 100 req/min)
- **Cache** : réponses GET en mémoire avec TTL configurable
- **Proxy mTLS** : forwarde la requête au service cible, supprime `x-api-key` des headers, timeout configurable

## Ordre de démarrage

Position 6 — après job-scheduler, port 8448. Dépend uniquement de `discovery-server:healthy`.

## Impact panne

- **Services internes**: aucun impact (communication directe en mTLS)
- **Externe**: toutes les requêtes API échouent
- **Récupération**: Docker relance le container (20-50s), ré-enregistrement Discovery
