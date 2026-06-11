# Interface d'administration — Catalogue des données

## READ ONLY (dashboard / consultation)

### Service Registry & Discovery

| Donnée | Source | Filtres |
|--------|--------|---------|
| Services enregistrés (nom, instances, IP, port, version, heartbeat) | `discovery-server` → `ServiceRegistry` (in-memory) | serviceName, status (alive/dead) |
| Topologie des connexions (qui appelle qui) | `ServiceDiscovery` + `AddressManagerClient` | — |
| Cache du resolver API Gateway (instances résolues, expiration) | `api-gateway` → `CachedService` | serviceName |

### Market Data

| Donnée | Source | Filtres |
|--------|--------|---------|
| Bougies (open, high, low, close, volume) | `financial-scraper` → MySQL `market_candles` | symbole, intervalle, date, source |
| Trades (price, quantity, side) | `financial-scraper` → MySQL `market_trades` | symbole, date, source |
| Tickers 24h | `financial-scraper` → MySQL `market_tickers` | symbole, date, source |
| Snapshots du carnet d'ordres | `financial-scraper` → mémoire | symbole (live) |
| Statistiques de normalisation (moyenne, variance) | `trader-trainer` → `NormalizationStats` | symbole |

### Audit & Events

| Donnée | Source | Filtres |
|--------|--------|---------|
| Événements d'audit | `audit-logger` → MongoDB `audit_events` | topic, publisher, correlationId, startDate, endDate, page |
| Statistiques (volume par topic/publisher, date range) | `audit-logger` → `AuditStats` | — |

### Message Broker

| Donnée | Source | Filtres |
|--------|--------|---------|
| Subscriptions actives (topic → callbackUrl, instanceId) | `message-manager` → `Dispatcher` (in-memory) | topic |
| Dead Letter Queue (message, raison, tentative, timestamp) | `message-manager` → `DqlEntry` (fichier) | — |

### Certificate Authority

| Donnée | Source | Filtres |
|--------|--------|---------|
| Certificats signés (serialNumber, serviceId, issuedAt, expiresAt, fingerprint) | `certificate-authority` → MongoDB `certificates` | serviceId, status (valid/expired) |
| Liste de révocation (CRL) | `certificate-authority` → MongoDB `crl` | — |
| Métadonnées CA (fingerprint, dates) | `certificate-authority` → MongoDB `ca_store` | — |

### Job Scheduler

| Donnée | Source | Filtres |
|--------|--------|---------|
| File d'attente des jobs (type, priorité, statut, worker, tentatives) | `job-scheduler` → MongoDB `jobs` | status, type, workerId |
| Travailleurs enregistrés (adresse, charge, statut, heartbeat) | `job-scheduler` → MongoDB (workers) | status |
| Historique des événements d'un job | `job-scheduler` → `JobEvent[]` embarqué | jobId |

### Trader Trainer

| Donnée | Source | Filtres |
|--------|--------|---------|
| Résultats d'entraînement (fitness, sharpe, pnl, genome) | `trader-trainer` → `BestAgentSummary` | symbole, génération |
| Population courante (genomes, fitness, métriques) | `trader-trainer` → `GARunner` (mémoire) | génération |
| Archive (meilleurs genomes historiques) | `trader-trainer` → archive (mémoire) | — |
| État du MarketDataBuffer (symboles, mémoire) | `trader-trainer` → `MarketDataBuffer` | — |

### Configuration

| Donnée | Source | Filtres |
|--------|--------|---------|
| Variables d'environnement de chaque service | `common` → `BaseEnv` (Zod) | service |
| Seuils de couverture, tokens JWT, adresses distantes | `config/env.ts` de chaque service | — |

---

## WRITE / UPDATE / DELETE (actions admin)

| Action | Endpoint / API | Modèle | Type |
|--------|---------------|--------|------|
| Signer un certificat | `POST /certificate/sign` | `{ serviceId, csr, ttlMs }` → `SignedCertificate` | CREATE |
| Révoquer un certificat | `POST /certificate/revoke` | `{ serialNumber, reason }` → CRL | CREATE |
| Annuler un job | `PATCH /jobs/:id/status` | `{ status: cancelled }` | UPDATE |
| Re-soumettre un job failed | `POST /jobs/:id/resubmit` | Clone avec retryCount=0 | CREATE |
| Purger la DLQ | `DELETE /broker/dlq` | Supprime toutes les entrées | DELETE |
| Invalider une entrée cache | `DELETE /cache/:service` | Supprime `CachedService` | DELETE |
| Invalider tout le cache | `DELETE /cache` | Vide toutes les entrées | DELETE |
| Vider le MarketDataBuffer | `POST /training/buffer/clear` | Supprime `SymbolState[]` | DELETE |
| Draine un worker | `PATCH /workers/:id/status` | `{ status: draining }` | UPDATE |
| Bannir une instance service | `DELETE /services/:name/instances/:id` | Supprime du `ServiceRegistry` | DELETE |
| Ajuster le rate-limit | `PATCH /admin/config/rate-limit` | `{ windowMs, max }` | UPDATE |

---

## Pages recommandées (ordre de priorité)

1. **`/services`** — tableau des services enregistrés (READ) + bannir instance (DELETE)
2. **`/certificates`** — liste des certificats (READ) + signer (CREATE) / révoquer (CREATE)
3. **`/audit/events`** — logs avec recherche topic/date/publisher (READ)
4. **`/jobs`** — file d'attente des jobs (READ) + cancel/resubmit (UPDATE)
5. **`/broker/dlq`** — dead letter queue (READ) + purge (DELETE)
6. **`/training/results`** — résultats d'entraînement (READ)
7. **`/cache`** — état du cache API Gateway (READ) + invalidation (DELETE)
8. **`/workers`** — travailleurs enregistrés (READ) + drain (UPDATE)
9. **`/market-data`** — bougies/trades/tickers (READ avec filtres)
10. **`/config`** — variables d'environnement (READ)
