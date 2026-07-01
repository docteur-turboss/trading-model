# Data Processing Register — Art. 30 GDPR

> **Registered as of:** 2026-06  
> **Data Protection Officer:** Not required (<250 employees, no sensitive data at scale)  
> **Review cadence:** Quarterly

## Overview

This register documents all data processing activities of the trading-model platform, as required by Article 30 of the General Data Protection Regulation (GDPR).

**Fundamental conclusion:** The trading-model platform processes **no personal data** as defined by Art. 4(1) GDPR. All data is machine-generated (market prices, service metadata, operational logs). There are no human users, no user profiles, no registrations, no cookies, no tracking, no biometric data, no location data of individuals.

---

## Processing Activity 1: Market Data Ingestion

| Field | Value |
|-------|-------|
| **Purpose** | Ingest financial market data (OHLCV candles, trades, order books, tickers) for algorithmic trading agent training and backtesting |
| **Data categories** | Trading symbols (e.g., BTCUSDT), numeric price/volume data, timestamps, market identifiers |
| **Legal basis** | Legitimate interest (Art. 6(1)(f)) — necessary for the core business purpose of algorithmic trading research |
| **Data subjects** | None — machine-generated data only |
| **Recipients** | Internal: trader-trainer, audit-logger, message-manager |
| **Transfers outside EU** | Market data originates from **Binance API** (Cayman Islands). See third-party DPA assessment |
| **Retention period** | 5 years (financial regulatory requirement — MiFID II Art. 72 for trading records) |
| **Technical measures** | mTLS encryption in transit (TLS 1.3), MySQL at rest, access via RBAC service accounts |
| **System** | financial-scraper → MySQL (market_candles, market_trades, market_tickers) |

## Processing Activity 2: Message Routing

| Field | Value |
|-------|-------|
| **Purpose** | Inter-service message routing, topic-based publish/subscribe with delivery guarantees and dead-letter queuing |
| **Data categories** | Message payloads (JSON), metadata (topic, publisher identity, timestamps, correlation IDs), delivery status |
| **Legal basis** | Legitimate interest (Art. 6(1)(f)) — necessary for system operation |
| **Data subjects** | None — inter-service operational data |
| **Recipients** | All 9 platform services (internal only) |
| **Transfers outside EU** | None — all services are self-hosted |
| **Retention period** | Redis Streams: 2h TTL. MongoDB archive: 90 days. DLQ: 30 days |
| **Technical measures** | mTLS everywhere, message payload sanitization, HMAC integrity, deduplication |
| **System** | message-manager → Redis Streams + MongoDB |

## Processing Activity 3: Audit Logging

| Field | Value |
|-------|-------|
| **Purpose** | Immutable audit trail of all service events, decisions, transactions, and errors for traceability and compliance |
| **Data categories** | Service event metadata (publisher identity, message ID, topic, correlation ID, timestamp), payload snapshots |
| **Legal basis** | Legal obligation (financial regulation — MiFID II record-keeping) + Legitimate interest (security monitoring) |
| **Data subjects** | None — purely operational service event metadata |
| **Recipients** | Internal: admin-interface (read-only), compliance officers (via MongoDB queries) |
| **Transfers outside EU** | None |
| **Retention period** | 90 days (current) — recommended extension to 5 years for financial regulatory compliance |
| **Technical measures** | Append-only MongoDB collection, correlation ID linking, gap detection, TTL index |
| **System** | audit-logger → MongoDB (audit_events collection) |

## Processing Activity 4: Certificate Management

| Field | Value |
|-------|-------|
| **Purpose** | X.509 certificate lifecycle management for mTLS mutual authentication between all platform services |
| **Data categories** | Service identities (service names, instance IDs), RSA public keys, X.509 certificates, certificate serial numbers, CRL entries |
| **Legal basis** | Legitimate interest (Art. 6(1)(f)) — necessary for platform security |
| **Data subjects** | None — service identities only, no human identities |
| **Recipients** | All 9 platform services (certificate distribution via certificate-client) |
| **Transfers outside EU** | None |
| **Retention period** | Active certificates: 7 days (auto-rotation). Expired/revoked: 90 days. CA keys: 3 versions retained |
| **Technical measures** | AES-256-GCM encryption at rest for CA keys, SecureKeyStore for in-memory keys, mTLS distribution |
| **System** | certificate-authority → MongoDB + filesystem (AES-256 encrypted) |

## Processing Activity 5: ML Training Data

| Field | Value |
|-------|-------|
| **Purpose** | Training of genetic algorithm + deep Q-learning trading agents on historical market data |
| **Data categories** | Market data features (normalized arrays), agent genome parameters, fitness scores, training checkpoints |
| **Legal basis** | Legitimate interest (Art. 6(1)(f)) — necessary for core research activity |
| **Data subjects** | None — derived numeric features from machine data |
| **Recipients** | Internal: trader-trainer internal state, checkpoint files on shared volume |
| **Transfers outside EU** | None |
| **Retention period** | Best agent checkpoint: retained. Intermediate: discarded per auto-pruning. Training metrics: alongside audit trail |
| **Technical measures** | Shared volume with restricted RBAC, Lamarckian weight snapshots are machine-encoded arrays |
| **System** | trader-trainer → memory + shared volume (trainer-checkpoints-pvc) |

---

## Summary

| Activity | Personal Data? | Legal Basis | Retention | Transfers |
|----------|---------------|-------------|-----------|-----------|
| Market Data Ingestion | ❌ None | Legitimate interest | 5 years (MiFID II) | Binance API (Cayman Islands) |
| Message Routing | ❌ None | Legitimate interest | 2h–90 days | None |
| Audit Logging | ❌ None | Legal obligation + Interest | 90 days → target 5y | None |
| Certificate Mgmt | ❌ None | Legitimate interest | 7 days–90 days | None |
| ML Training | ❌ None | Legitimate interest | Per-agent | None |

**Conclusion:** All 5 processing activities operate on machine-generated data without any personal data (Art. 4(1) GDPR). No data subject rights (access, rectification, erasure, portability) are triggered. No consent is required. No Data Protection Officer appointment is mandatory.
