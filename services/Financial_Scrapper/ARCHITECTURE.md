# Architecture du Service de Web Scraper
## Présentation
Ce document décrit l'architecture technique du service, ses responsabilités internes et les conventions appliquées dans le projet.
## Objectifs
* Interroger des endpoints externes (Binance, autres APIs) avec des contraintes de débit et de volume configurables.
* Centraliser, normaliser et stocker les données pour des usages dérivés (analyse, backtesting, signaux).
* Exécuter un worker planifié ou continu, isolé du serveur HTTP, capable d'ingérer des données en flux régulier.
* Maintenir une séparation claire entre logique métier, accès aux données et orchestration.
## Structure
```bash
src/
├─ app/       
│   # Démarrage du service (HTTP, workers, cron)
│   # Setup global: logs, containers DI, monitoring, erreurs fatales
│   # Point d'entrée commun pour le runtime
│
├─ client/               
│   # Clients bas niveaux (HTTP, WebSocket, throttling)
│   # Ne contient aucune logique métier
│   └─ binance/          # Wrapper statique pour les endpoints Binance
│
├─ config/
│   # Chargement, validation et exposition des variables d'environnement
│   # Structure normalisée pour éviter la dérive de config
│   └─ .env              # Valeurs locales (ignoré du repo)
│
├─ jobs/
│ ├─ cron/               
│ │   # Définition des tâches programmées
│ │   # Orchestration simple : appelle engines + services
│ ├─ engines/            
│ │   # "Drivers" pour chaque source externe
│ │   # Implémentation du pattern Strategy
│ │   # Encapsule la façon d'appeler une API donnée
│ ├─ services/           
│ │   # Logique métier propre aux jobs (transformation, validation, pipeline)
│ └─ worker/             
│     # Worker continu/async
│     # Récupération + traitement + persistance
│     # Doit être isolé du serveur public
│
├─ models/               # Déprécié - remplacé par storage/models
├─ repository/           # Déprécié - remplacé par storage/repositories
│
├─ scraper/              
│   # Scraping hors APIs (HTML, DOM, extraits)
│   # Optionnel : pipelines spécifiques selon la source
│
├─ services/             
│   # Logique métier centrale (hors jobs)
│   # Utilisé par le serveur HTTP ou d'autres modules internes
│
├─ controller/           
│   # Validation d'entrée/sortie
│   # Orchestration légère avant appel des services
│
├─ router/               
│   # Définition des routes HTTP
│   # Pas de logique métier ici
│
├─ middleware/
│   # Middleware HTTP (auth, rate limit, logging, sécurité)
│
├─ storage/
│ ├─ models/             
│ │   # Structures de données + schemas (ORM/QueryBuilder)
│ │   # Modèles métiers persistés
│ └─ repositories/       
│     # Accès DB (CRUD, queries, transactions)
│     # Niveau d'abstraction unique pour la persistance
│
├─ utils/
│   # Fonctions génériques : sleep, retry, format, helpers
│   # Aucun import inversé depuis la logique métier
│
├─ tests/
│   # Tests unitaires + e2e
│
└─ types/
    # Typage global du projet (DTO, interfaces, déclarations externes)
```

## Notes
* **Séparation stricte des couches** : le code métier n'appelle jamais directement des clients externes ni la base de données.
* **Clients → Engines → Services → Repository** : pipeline standard d'une ingestion.
* **Worker isolé** : évite la congestion HTTP, garantit la stabilité.
* **Storage comme source de vérité** : toutes les entités persistées doivent être définies sous `/storage/models`.
* **Jobs deterministes** : pas de logique floue dans les crons ; la logique doit résider dans les services dédiés.

## Points à Ajuster
* Liste des engines actifs selon l'environnement
* Pipeline d'ingestion complet (normalisation → mapping → persistance) 