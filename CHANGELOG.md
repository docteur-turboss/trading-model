## [2.1.0] - 2026-11-06

### @trading-model/common (1.2.1 → 1.3.0)

#### Feat

- bd463e1 **common:** add BACKPRESSURE error code and reliability export
- 669a508 **common:** add feature flags, CRL, context, telemetry, reliability, token service
- 2685fd3 **common:** add CaClient for certificate authority lifecycle management

#### Fix

- 9e618ea **common:** add certificate-client to build chain, fix dlq-service type
- b4b181c **common:** fix typecheck - env Object.fromEntries inference, generic naming, import casing
- 821d106 **common:** add missing OpenTelemetry deps and fix for @opentelemetry/resources v2 API
- 11b40be **common:** clear timeout handle in server close to prevent open handles

#### Refactor

- b6c3265 **common:** format test assertions in handle-core-response.spec.ts
- 6a3e373 **common:** refactor server bootstrap - TLS lifecycle, shutdown timeout
- 2357c16 **common:** refactor Logger - fs/promises, LOG_DIR, fix regex
- 4564ed5 **common:** refactor HttpClient - lazy TLS, circuit breakers, adaptive timeout
- b7fd540 **common:** update contracts - CA events, region, sequenceNumber, CertificatePath, RegistryBackend

#### Docs

- 047d009 **common:** add JSDoc to request(), document isServiceCircuitOpen side-effect

#### Test

- 6637344 **common:** update test assertions to match English error messages
- 5ac2023 **common:** add coverage tests for 100% statements, branches and functions
- 0c65aa0 **common:** add tests for circuit breakers, TLS, bootstrap, server-factory, ca-client

#### Other

- e0d8a3d **common:** fix import order lint errors in http-client and server-factory

### discovery-server (1.1.1 → 1.1.2)

#### Fix

- 4a0b384 **discovery-server:** fix env type inference and class property error
- fe48588 **discovery-server:** add missing ioredis dependency

#### Test

- 64c37d0 **discovery-server:** fix timeout cleanup in ws-discovery tests

### message-manager (1.1.1 → 1.1.2)

#### Fix

- 5f823ce **message-manager:** fix typecheck errors - Env type inference, import casing, ack return type
- 6174c45 **message-manager:** fix type errors across services

#### Refactor

- 7963ae1 **message-manager:** fix Biome lint - formatting, noMisusedPromises, useAwait
- 22923f5 **message-manager:** migrate Redis config, telemetry, and imports

### @trading-model/address-manager (1.2.0 → 1.3.0)

#### Feat

- 8a532e9 **address-manager:** add circuit breaker, redis cache, metrics, load balancing

#### Fix

- 4b88d52 **address-manager:** align AddressManagerEnv field names with env-var UPPERCASE convention

#### Refactor

- 66aed3a **address-manager:** fix TS build — align interfaces, add missing methods and config props
- 33d9e0c **address-manager:** clear reconnectTimer before scheduling new reconnect
- 31a62c3 **address-manager:** fix CertificatePath property names in object literal
- 452b51f **address-manager:** fix CertificatePath property names to match TlsClientPaths contract

#### Style

- c3a5cbe **address-manager:** fix prettier formatting in 3 files

### @trading-model/broker-message (1.1.0 → 1.2.0)

#### Feat

- 5c404ff **broker:** add WebSocket Secure client

#### Fix

- 390a56e **broker:** fix BadRequest casing typo in messages.controller

### dlq-service (2.0.0 → 2.1.0)

#### Feat

- 430c4f5 **dlq-service:** add new DLQ service

### api-gateway (1.0.0 → 1.1.0)

#### Feat

- 00b9b2c **api-gateway:** add API Gateway service with versioned routing, auth, rate limiting, and caching (#263)

### audit-logger (1.0.0 → 1.1.0)

#### Feat

- 3c9572e **audit-logger:** add audit logger service with full unit tests and 100% coverage (#261)

### Root

#### Style

- 5e3c7cc Lint fix
- 15651cf Lint rewrite

#### Test

- be32ede add crypto-worker unit tests
- 91484da fix timer leak in certificate-client bootstrap tests

#### Chore

- 691c397 update package-lock.json with certificate-client and crypto-worker entries
- 4f0eabb add test:detectOpenHandles script to all packages and services


## [Unreleased]

### Overview

Major clean-code refactor (`refactor/clean-code-v3`): simplification and reorganization of the monorepo.

#### Refactor

- **DDD/hexagonal restructure** — all services migrated to `domain/` + `application/` + `adapters/` + `infrastructure/` layers (ADR-0010 generalized to all services)
- **Package split** — `@trading-model/common` split into `validation`, `server-utils`, `crypto`, `http` (ADR-0007); the `jobs` package created by that split was later removed (ADR-0029), leaving 11 shared packages
- **Workload identity** — in-house certificate-authority and `certificate-*` packages removed in favour of SPIFFE/SPIRE (ADR-0011); migration from npm to bun completed (`bun.lock` is the only lockfile)
- **Dead code removal** — deprecated services (`crypto-worker`, `job-scheduler`, `certificate-authority`) and legacy modules (checkpoint/buffer/diversity) removed
- **Consolidation** — duplicate circuit breakers, caches and WS clients unified into shared implementations; branded domain primitives adopted repo-wide
- **Tooling** — ESLint/Prettier fully replaced by Biome; Stryker mutation-testing config added

#### Chore

- Husky pre-push hook switched to `biome check` → `build` → `test`

## [2.0.3] - 2026-06-08

### financial-scraper (1.2.0 → 1.2.1)

#### Fix

- 6776f2e **financial-scraper:** fix p-limit dynamic import type reference for v7.x


## [2.0.1] - 2026-06-08

### @trading-model/common (1.2.0 → 1.2.1)

#### Refactor

- 03ec2dd **common:** centralize message contracts into @trading-model/common (#188)

#### Chore

- a157830 **common:** add release:publish script, verification protocol, GHCR_TOKEN docs


## [1.3.3] - 2026-06-07

### trader-service (1.3.2 → 1.3.3)

#### Fix

- :bug:(trainer): add input length validation to all loss functions to prevent silent NaN propagation on output/target mismatch (#118)

#### Test

- :white_check_mark:(trainer): add validation tests for length mismatch in all loss and gradient functions

## [1.3.2] - 2026-06-07

### trader-service (1.3.1 → 1.3.2)

#### Fix

- :bug:(trainer): add pool bounds guard in trainPhase to prevent out-of-bounds access on pool[pool.length - 2] (#117)

#### Test

- :white_check_mark:(trainer): add unit tests for evaluation-pipeline trainPhase pool bounds check and pooledEval

## [1.3.1] - 2026-06-07

### @trading-model/address-manager (1.1.0 → 1.1.1)

#### Fix

- :bug:(address-manager): log scheduler job execution errors instead of swallowing them silently (#114)
- :bug:(address-manager): preserve original error type via cause property in AddressManagerError (#115)
- :bug:(address-manager): add configurable timeout to findService HTTP calls to prevent indefinite hangs (#116)

#### Test

- :white_check_mark:(address-manager): add test for error logging when job.execute throws
- :white_check_mark:(address-manager): add tests verifying original error is preserved via cause property
- :white_check_mark:(address-manager): add test verifying timeout option is passed to HttpClient.get

## [1.3.0] - 2026-06-06

### @trading-model/common (1.0.0 → 1.1.0)

#### Refactor

- fa2bb7e **common:** centralize ServiceInstance, makePRNG, message-manager config, rateLimit, loadTlsConfig, PING_PATH, sleep, trader-trainer env, naming bug, hosts.json endpoint
- 1668c70 **common:** derive types from const (MarketType/SourceType), computed EventMap keys, export ServiceInstanceName type, fix key-name bugs in schemas/tests
- 8086f93 **common:** centralize duplicated code, add comprehensive JSDoc, improve TypeScript patterns (#66)

#### Fix

- cfe1799 **common:** fix JSON.stringify circular reference in logger
- 42d9589 **common:** fix HttpClient PEM cert loading and AddressManager this binding
- 04ad1f2 **common:** add /ping healthcheck and curl for container healthchecks

### @trading-model/address-manager (1.0.0 → 1.1.0)

#### Fix

- d2c22b5 **address-manager:** resolve double-encoding in ResponseProtocol and service resolution in AddressManager (#64)

### @trading-model/broker-message (1.0.0 → 1.1.0)

#### Fix

- 6389e6a **message-manager:** fix path alias and this binding in broker configs

### trader-service (1.2.0 → 1.3.0)

#### Test

- d0a0c4a **trader-trainer:** set minimum test coverage to 80%

### services

#### Docs

- 28c01a4 **docs:** restructure documentation into standards/deployment/architecture hierarchy with TypeDoc, PR/issue templates, and AI summary
- 3abf8b8 **docs:** add JSDoc to all source files following JSDOC_STANDARD.md

#### Ci

- d5c0e4d **github-actions:** upgrade actions/checkout/setup-node to v5 (Node.js 24), fix eslint any in helpers.ts
- 55d7dc9 **github-actions:** merge lint/build/test into ci.yml, add explicit workflow permissions; fix docs and deploy scripts alignment (#65)
- ddc24ea **scripts:** add trading-discovery-1 to cert SANs and use as CN

### Docker / Deployment

#### Fix

- d675b13 **docker:** fix financial-scraper p-limit CJS compat, docker ignore-scripts

#### Ci

- 567f6d7 **github-actions:** fix heredoc syntax in release notes generation
- 2d56843 **ci:** use GHCR_TOKEN PAT for docker push permissions
- 594ebb5 **ci:** fix lockfile sync, ignore husky scripts in Docker deps, fix event type narrowing
- 5572d14 **ci:** add buildx setup and sync lockfile for release workflow

#### Docs

- 19bf308 **financial-scraper:** add VM host setup guide and beta server inventory
- 28caaf5 **config:** add beta canary deploy server with 2% rollout (#62)

## [1.2.0] - 2026-06-03

### trader-service (1.1.0 → 1.2.0)

#### Feat

- f91a2a7 **trader-trainer:** Add trader trainer module with full test coverage and infrastructure improvements

## [1.1.0] - 2026-05-20

### trader-service (1.0.0 → 1.1.0)

#### Feat

- f91a2a7 **trader-trainer:** Add trader trainer module with full test coverage and infrastructure improvements
