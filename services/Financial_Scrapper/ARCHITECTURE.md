# Architecture of the Web Scraper Service

## Overview

This document describes the technical architecture of the service, its internal responsibilities, and the conventions applied in the project.

## Objectives

* Query external endpoints (Binance, other APIs) under configurable rate and volume constraints.
* Centralize, normalize, and store data for downstream use cases (analysis, backtesting, signals).
* Run scheduled or continuous workers, isolated from the HTTP server, capable of ingesting data in a steady stream.
* Maintain a clear separation between business logic, data access, and orchestration.

## Structure
```bash
src/
├─ app/       
│   # Service bootstrap (HTTP, workers, cron)
│   # Global setup: logging, DI containers, monitoring, fatal error handling
│   # Common runtime entrypoint
│
├─ client/               
│   # Low-level clients (HTTP, WebSocket, throttling)
│   # Contains no business logic
│   └─ binance/          # Static wrapper for Binance endpoints
│
├─ config/
│   # Environment variables loading, validation, and exposure
│   # Normalized configuration structure to prevent config drift
│   └─ .env              # Local values (ignored by repo)
│
├─ jobs/
│ ├─ cron/               
│ │   # Scheduled job definitions
│ │   # Simple orchestration: calls engines + services
│ ├─ engines/            
│ │   # Drivers for each external source
│ │   # Implements the Strategy pattern
│ │   # Encapsulates how a given API is called
│ ├─ services/           
│ │   # Job-specific business logic (transformation, validation, pipeline)
│ └─ worker/             
│     # Continuous/async workers
│     # Fetching + processing + persistence
│     # Must be isolated from the public server
│
├─ models/               # Deprecated - replaced by storage/models
├─ repository/           # Deprecated - replaced by storage/repositories
│
├─ scraper/              
│   # Non-API scraping (HTML, DOM extraction)
│   # Optional: source-specific pipelines
│
├─ services/             
│   # Core business logic (outside jobs)
│   # Used by HTTP server or other internal modules
│
├─ controller/           
│   # Input/output validation layer
│   # Lightweight orchestration before calling services
│
├─ router/               
│   # HTTP route definitions
│   # No business logic here
│
├─ middleware/
│   # HTTP middleware (auth, rate limiting, logging, security)
│
├─ storage/
│ ├─ models/             
│ │   # Data structures + schemas (ORM/query builder)
│ │   # Persisted business models
│ └─ repositories/       
│     # Database access layer (CRUD, queries, transactions)
│     # Single abstraction level for persistence
│
├─ utils/
│   # Generic helpers: sleep, retry, formatting, utilities
│   # No reverse dependency from business logic
│
├─ tests/
│   # Unit + end-to-end tests
│
└─ types/
    # Global type definitions (DTOs, interfaces, external declarations)
```

## Notes

* **Strict layer separation**: business code never directly calls external clients or the database.
* **Clients → Engines → Services → Repository**: standard ingestion pipeline.
* **Isolated workers**: prevents HTTP congestion and ensures stability.
* **Storage as source of truth**: all persisted entities must be defined under `/storage/models`.
* **Deterministic jobs**: no ambiguous logic in cron jobs; logic must live in dedicated services.

## Points to Adjust

* List of active engines depending on environment
* Full ingestion pipeline (normalization → mapping → persistence)