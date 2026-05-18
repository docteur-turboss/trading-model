 Diagramme d'Architecture Actuelle
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           MONOREPO ROOT (npm workspaces: packages/*)             │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌───────────────────────── PACKAGES (shared libs) ───────────────────────────┐ │
│  │                                                                              │ │
│  │  @trading-model/common (v1.0.0)         @trading-model/address-manager      │ │
│  │  ┌─────────────────────────────────┐    ┌──────────────────────────────┐   │ │
│  │  │ config/  logger, httpClient,    │    │ AddressManagerClient         │   │ │
│  │  │          event.types,           │    │ TokenManager                 │   │ │
│  │  │          services.types,        │    │ ServiceDiscovery (cache+     │   │ │
│  │  │          deliveryMode.types     │    │   health-check)              │   │ │
│  │  │ middleware/ catchError,         │    │ ServiceCache (TTL)           │   │ │
│  │  │            responseException,   │    │ ServiceHealthChecker         │   │ │
│  │  │            responseProtocole,   │    │ Scheduler + Jobs             │   │ │
│  │  │            handleCoreResponse,  │    │ PingController               │   │ │
│  │  │            MTLSAuth             │    └──────────┬───────────────────┘   │ │
│  │  │ utils/    Errors               │               │ dépend                 │ │
│  │  └─────────────────────────────────┘               │                       │ │
│  │                                                    ▼                       │ │
│  │                                     @trading-model/broker-message           │ │
│  │                                     ┌──────────────────────────────┐       │ │
│  │                                     │ MessageManagerClient         │       │ │
│  │                                     │ EventManager (EventEmitter)  │       │ │
│  │                                     │ MessageController + Routes   │       │ │
│  │                                     │ MessageMetadata Builder      │       │ │
│  │                                     │ Zod schemas                  │       │ │
│  │                                     └──────────────────────────────┘       │ │
│  └──────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────── SERVICES ─────────────────────────────────────────┐ │
│  │                                                                              │ │
│  │  DISCOVERY-SERVER (Port 8443)              FINANCIAL_SCRAPPER (Port 8444)   │ │
│  │  ┌──────────────────────────────────┐     ┌─────────────────────────────┐  │ │
│  │  │ ServiceRegistry (in-memory Map) │     │ Binance API Client (axios)  │  │ │
│  │  │ LeaseManager (TTL eviction)     │     │ DB Models (Mongo)           │  │ │
│  │  │ POST /register                  │     │ Cron Jobs (node-cron)       │  │ │
│  │  │ POST /heartbeat                 │     │ Address Manager intégré     │  │ │
│  │  │ POST /token/rotate              │     │ Message Manager intégré     │  │ │
│  │  │ GET /services                   │     │ GET /trade, /ticker,        │  │ │
│  │  │ GET /services/:name             │     │   /candles, /orderbook      │  │ │
│  │  │ GET /services/:name/:id         │     └─────────────────────────────┘  │ │
│  │  │ GET /dump                       │                                       │ │
│  │  └──────────────────────────────────┘                                       │ │
│  │                                                                              │ │
│  │  MESSAGE-MANAGER (Port 8445)             TRADER-TRAINER (Port 3001)        │ │
│  │  ┌──────────────────────────────────┐     ┌─────────────────────────────┐  │ │
│  │  │ Broker (publish facade)          │     │ Genetic Algorithm Engine    │  │ │
│  │  │ Dispatcher (routing)             │     │ Neural Network (custom)    │  │ │
│  │  │ Subscription Management          │     │ Trading Agent (NN+Wallet)  │  │ │
│  │  │ HTTP Transport Controller        │     │ Wallet Manager (simulation) │  │ │
│  │  │ Zod Validation                   │     │ State Manager (RL)         │  │ │
│  │  │ MongoDB (persistence)            │     │ Express (sans mTLS)        │  │ │
│  │  │ Address Manager intégré          │     └─────────────────────────────┘  │ │
│  │  └──────────────────────────────────┘                                       │ │
│  └──────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
Légende :
→ dépendance forte (import direct)
⇢ dépendance via cash-lib (legacy alias)
2. Graphe de Dépendances
@trading-model/common  (logger, httpClient, middleware, types, errors)
       ↑                          ↑
       |                          |
@trading-model/address-manager    |
  - common (mTLS, logger, Errors) |
       ↑                          |
       |                          |
@trading-model/broker-message ────┘
  - common (types, errors)
  - address-manager (service discovery)
SERVICES → SHARED LIBS :
Discovery-Server
  → cash-lib/config/logger          [legacy alias → @trading-model/common]
  → cash-lib/middleware/*           [legacy alias → @trading-model/common]
  → cash-lib/config/services.types  [legacy alias → @trading-model/common]
  → (pas de dépendance aux autres packages)
Financial_Scrapper
  → cash-lib/config/logger
  → cash-lib/middleware/*
  → cash-lib/adress-manager/index   [legacy alias → @trading-model/address-manager]
  → cash-lib/message-manager/index  [legacy alias → @trading-model/broker-message]
  → cash-lib/config/services.types
  → cash-lib/config/event.types
  → cash-lib/utils/Errors
Message-Manager
  → cash-lib/config/logger
  → cash-lib/middleware/*
  → cash-lib/adress-manager/index   [dup: presque identique à Financial_Scrapper]
  → messaging                       [alias local → src/messaging/]
Trader-Trainer
  → cash-lib/middleware/catchError
  → cash-lib/middleware/responseException
  → cash-lib/middleware/responseProtocole
  → (pas de message-manager ni address-manager)
Problème critique : cash-lib legacy alias
Les services utilisent import ... from "cash-lib/..." qui pointe vers file:../../lib — un répertoire qui semble être une version antérieure non synchronisée avec les packages/* du workspace. Les packages actuels sont @trading-model/* via le workspace npm, mais les services importent depuis un alias cash-lib qui n'est PAS dans le workspace.
3. Inventaire du Code Dupliqué
3A. Duplication Inter-Services (critique)
Code dupliqué	Occurrences
Bootstrap serveur HTTPS + mTLS	3× quasi-identique
Bootstrap application (signal handlers, shutdown)	3× quasi-identique
Config address-manager.ts	2× strictement identique
Validation Zod env	3× même pattern (champs communs)
Rate limiting config	3×
Package.json devDeps	6× les mêmes 15 packages
Utilities validate.ts	1× (mais devrait être dans common)
readCert.ts	1× trivial
generateRandomStr.ts	1×
3B. Duplication Intra-Package (modérée)
Code dupliqué	Détail
Classes d'erreurs	Errors.ts dans common définit AddressManagerBaseError et MessageManagerBaseError qui sont structurellement identiques (copier-coller avec rename). AgentBaseError idem.
MTLSAuth + catchError	Le middleware MTLSAuth.ts réimplémente catchSync manuellement au lieu de l'importer
4. Inventaire des Utilitaires Transverses
4A. Déjà mutualisés dans @trading-model/common ✓
Module	Fichier
Logger (file + console + webhook)	common/src/config/logger.ts
HttpClient (HTTPS + mTLS)	common/src/config/httpClient.ts
Types événements marché	common/src/config/event.types.ts
Constantes services	common/src/config/services.types.ts
Delivery Mode enum	common/src/config/deliveryMode.types.ts
catchSync (async error wrapper)	common/src/middleware/catchError.ts
ResponseException (factory HTTP)	common/src/middleware/responseException.ts
ResponseProtocole (error handler)	common/src/middleware/responseProtocole.ts
MTLSAuth (mTLS middleware)	common/src/middleware/MTLSAuth.ts
handleCoreResponse	common/src/middleware/handleCoreResponse.ts
Classes d'erreurs domain	common/src/utils/Errors.ts
4B. Dans les services, PAS mutualisés (devraient l'être) ✗
Utilité
Validation générique (isNonEmptyString, isObject, etc.)
Génération aléatoire crypto
Schémas Zod pour message broker
Types de payloads subscribe/unsubscribe
Config types pour message-manager
Prng (seeded RNG)
Sleep utility
Error classes message-manager
4C. Patterns de serveur dupliqués (candidats à l'extraction)
Le pattern suivant est répété 3× avec des variations mineures :
helmet() → trust proxy → express.json({limit:'1mb'}) → urlencoded
→ rateLimit → MTLSAuthMiddleware → routes métier → ResponseProtocole
→ https.createServer(mTLS config) → listen
Ce pattern pourrait être un createSecureServer(options) dans common.
5. Contrats API Actuels
Discovery-Server
Endpoint	Méthode
/register	POST
/heartbeat	POST
/token/rotate	POST
/services	GET
/services/:name	GET
/services/:name/:id	GET
/dump	GET
Financial_Scrapper
Endpoint
/trade/sources/:source
/trade/symbols/:symbol
/trade/timestamp/:timestamp
/ticker/sources/:source
/ticker/symbols/:symbol
/ticker/timestamp/:timestamp
/candles/sources/:source
/candles/symbols/:symbol
/candles/timestamp/:timestamp
/orderbook/sources/:source
/orderbook/symbols/:symbol
/orderbook/after/timestamp/:timestamp
/heartbeat/before/timestamp/:timestamp
Trader-Trainer
Endpoint
/ping
6. Modèles de Données
ServiceInstance (Discovery-Server → utilisable comme DTO partagé)
interface ServiceInstance {
  lastHeartbeat: number;      // timestamp
  registeredAt: number;       // timestamp
  serviceName: string;        // logical name
  instanceId: string;         // unique per instance
  protocol: "http" | "https" | "mtls";
  port: number;
  env?: string;
  ttl: number;                // ms
  ip: string;
}
Événements marché (EventMap — déjà dans common)
interface EventMap {
  "market.trade.recent.fetch":           { trades: TradeEntity[] }
  "market.ticker.24hr-stats.fetch":      { ticker: TickerEntity[] }
  "market.candlestick.series.fetch":     { candle: CandleEntity[] }
  "market.order-book.snapshot.fetch":    { orderBook: OrderBookEntity[] }
  "market.price-ticker.snapshot.fetch":  { price: Record<string, number> }
  "market.order-book-ticker.snapshot.fetch": { bookTicker: BookTickerEntity[] }
}
Message envelope (broker-message)
interface message<T> {
  metadata: {
    messageId: string;
    emittedAt: Date;
    topic?: string;
    source?: string;
    deliveryMode?: DeliveryModeEnum;
    // ...etc (MessageMetadata builder)
  };
  payload: T;
}
7. Conventions Techniques Actuelles
Convention	Statut
Nommage	Incohérent
Types	Strict
Modules	CommonJS
Target	ES2020
Tests	Mix .spec.ts / .test.ts
Documentation JSDoc	Très verbouse
Alias paths	Incohérent
Formatage	Prettier
Linting	ESLint 10 flat config
Validation	Zod
Gestion erreurs	ResponseException throw
8. Ce qui DOIT Être Mutualisé vs. Ce qui NE DOIT PAS
✅ Bons candidats pour la shared lib
Priorité	Module	Contenu
P0	@trading/common/server	createSecureServer() — factory pour serveur HTTPS + mTLS + middleware chain standard
P0	@trading/common/bootstrap	createAppBootstrap() — lifecycle manager (signals, shutdown, process handlers)
P0	@trading/common/env	createEnvSchema(baseSchema) — helper pour construire des schémas Zod d'env sans duplication
P1	@trading/common/validation	isNonEmptyString, isObject, isValidIP, isValidPort
P1	@trading/common/crypto	generateRandomStr, prng (seeded RNG)
P1	@trading/common/contracts	Schémas Zod pour payloads service registry, message broker
P2	@trading/common/errors	Fusionner les 3 hiérarchies d'erreurs en une seule
P2	@trading/common/http	Retry policy, circuit breaker (wrapper autour d'HttpClient)
P3	@trading/common/observability	Métriques d'usage, tracing
P3	@trading/common/resilience	Retry, circuit breaker, timeout patterns
❌ Mauvais candidats (logique métier)
Module
Neural Network (Trader-Trainer)
Genetic Algorithm (Trader-Trainer)
Wallet Manager (Trader-Trainer)
Binance Client (Financial_Scrapper)
Broker core (Message-Manager)
ServiceRegistry (Discovery-Server)
Market Data Models (Financial_Scrapper)
9. Proposition de Structure Cible pour la Shared Lib
packages/common/
├── src/
│   ├── config/              # (déjà existant, à consolider)
│   │   ├── logger.ts
│   │   ├── httpClient.ts
│   │   ├── event.types.ts
│   │   ├── services.types.ts
│   │   └── deliveryMode.types.ts
│   │
│   ├── contracts/           # NOUVEAU : DTO et schémas partagés
│   │   ├── service-registry.types.ts   # ServiceInstance, payloads
│   │   ├── message-payloads.types.ts   # Subscribe/Unsubscribe
│   │   └── message.schema.ts           # Zod schemas
│   │
│   ├── middleware/          # (existant, à stabiliser)
│   │   ├── catchError.ts
│   │   ├── responseException.ts
│   │   ├── responseProtocole.ts
│   │   ├── handleCoreResponse.ts
│   │   └── MTLSAuth.ts
│   │
│   ├── server/              # NOUVEAU : factories serveur
│   │   ├── createSecureServer.ts   # HTTPS + mTLS Express factory
│   │   └── bootstrap.ts            # Lifecycle manager
│   │
│   ├── validation/          # NOUVEAU (depuis Discovery-Server)
│   │   ├── primitives.ts    # isNonEmptyString, isObject, etc.
│   │   └── env.ts           # createEnvSchema helper
│   │
│   ├── crypto/              # NOUVEAU
│   │   ├── random.ts        # generateRandomStr
│   │   └── prng.ts          # Seeded PRNG (depuis Trader-Trainer)
│   │
│   ├── errors/              # EXISTANT mais à restructurer
│   │   └── Errors.ts        # Hiérarchie unique
│   │
│   ├── resilience/          # NOUVEAU (futur)
│   │   ├── retry.ts
│   │   ├── circuitBreaker.ts
│   │   └── timeout.ts
│   │
│   ├── observability/       # NOUVEAU (futur)
│   │   ├── metrics.ts
│   │   └── tracing.ts
│   │
│   └── utils/               # NOUVEAU
│       ├── sleep.ts
│       └── clamp.ts         # (depuis Trader-Trainer)
10. Règles de Dépendance
DIRECTION AUTORISÉE :
  service → @trading/common/* ✓
  service → @trading/address-manager ✓
  service → @trading/broker-message ✓
DIRECTIONS INTERDITES :
  @trading/common → service ✗ (dépendance circulaire)
  @trading/address-manager → service ✗
  broker-message → address-manager ✓ (OK car infrastructure)
  address-manager → broker-message ✗ (pas de raison)
SENS UNIQUE :
  common → (rien) — common ne dépend que de packages npm (express, zod)
  address-manager → common
  broker-message → address-manager → common
11. Plan d'Extraction Progressive
Semaine 1 — Phase 0 : Résoudre l'alias cash-lib
1. 
Supprimer le dossier lib/ legacy
2. 
Remplacer tous les import "cash-lib/..." par import "@trading-model/common/..."
3. 
Vérifier que tous les tsconfig des services pointent vers le workspace
4. 
Ajouter "build" et "test" scripts dans root pour workspace
Semaine 1-2 — Phase 1 : Extraction serveur + bootstrap
1. 
Copier createSecureServer() dans common/src/server/createSecureServer.ts
- 
(options: { routes, tlsPaths, port, rateLimit? }) => HttpServer
2. 
Copier le lifecycle manager dans common/src/server/bootstrap.ts
- 
createBootstrap({ name, createServer, onStart?, onStop? })
3. 
Adapter Discovery-Server comme service pilote (Étape B)
4. 
Valider : npm test, npm run build
Semaine 2 — Phase 2 : Contracts et validation
1. 
Extraire validate.ts → common/src/validation/primitives.ts
2. 
Créer contracts/service-registry.types.ts avec ServiceInstance, payloads
3. 
Créer contracts/message-payloads.types.ts
4. 
Migrer Message-Manager et Financial_Scrapper
Semaine 2-3 — Phase 3 : Env schema helper
1. 
Créer validation/env.ts : createEnvSchema(baseFields, extraFields)
2. 
Unifier les 3 schémas env en un socle commun + extensions spécifiques
3. 
Migration progressive des services
Semaine 3-4 — Phase 4 : Réduction duplication erreurs
1. 
Fusionner les hiérarchies d'erreurs dans common
2. 
Supprimer les fichiers d'erreurs locaux dans Message-Manager
3. 
Ajouter les classes d'erreur manquantes
Semaine 4-5 — Phase 5 : Observabilité + résilience
1. 
Ajouter métriques d'usage sur la shared lib
2. 
Ajouter retry policy wrapper pour HttpClient
3. 
Feature flags pour la migration progressive
Semaine 5-6 — Phase 6 : CI/CD + gouvernance
1. 
Build automatique de la shared lib
2. 
Tests de compatibilité inter-services
3. 
Semantic versioning + changelog
4. 
Documentation des règles d'ajout dans la shared lib
12. Stratégie de Tests de Compatibilité
Tests unitaires (shared lib)
Chaque module extrait doit avoir ses tests avant migration
Coverage seuil : 90% (vs 80% actuel)
Contract tests (nouveaux)
// Exemple : test que ServiceInstance respecte le contrat
test('ServiceInstance schema matches Discovery-Server contract', () => {
  const payload = { serviceName: 'test', ip: '192.168.1.1', port: 8080 };
  const result = ServiceRegistrySchema.parse(payload);
  expect(result).toMatchContract('ServiceRegistration');
});
Integration tests (inter-services)
Tester que Financial_Scrapper peut s'enregistrer via le nouveau client
Tester que Message-Manager reçoit bien les événements
Compatibility suite
Un script npm run check-compat qui valide que toutes les dépendances croisées fonctionnent avec la version courante de la shared lib
13. Anti-Patterns à Éviter
Anti-pattern	Risque actuel
Shared kernel géant	common/ risque de tout absorber
Couplage temporel	Services doivent build ensemble
Utils fourre-tout	common/utils/, common/config/ déjà tentation
Cash-lib legacy	Alias mort qui peut diverger
Shared DB déguisée	Modèles de données mutables dans common
14. Architecture Cible
                    ┌─────────────────────────────────────┐
                    │        @trading/common              │
                    │  (server, bootstrap, contracts,     │
                    │   validation, crypto, errors,       │
                    │   resilience, observability)        │
                    └────────────────┬────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  @trading/address-  │   │ @trading/broker-    │   │  (futurs packages)  │
│  manager             │   │ message             │   │                     │
│  (client lib,       │   │ (messaging SDK,     │   │                     │
│   discovery, cache) │   │  EventEmitter)      │   │                     │
└──────────┬──────────┘   └──────────┬──────────┘   └─────────────────────┘
           │                         │
           └────────────┬────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ Discovery    │ │Financial │ │ Message      │
│ Server       │ │Scrapper  │ │ Manager      │
│ (service     │ │(service  │ │ (service     │
│  registry)   │ │ data     │ │  broker)     │
│              │ │ ingest)  │ │              │
└──────────────┘ └──────────┘ └──────────────┘
Avec cette architecture :
Les services ne dépendent que des packages (jamais l'inverse)
common est un socle d'infrastructure pur, sans logique métier
address-manager et broker-message sont des SDK clients spécialisés
Le couplage est réduit : chaque package peut versionner indépendamment
Les tests de compatibilité valident les contrats inter-packages