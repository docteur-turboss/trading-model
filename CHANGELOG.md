## [3.1.0-rc.1] - 2026-11-09

### Root

#### Feat

- 07adabb **release:** publish vX.Y.Z-rc.N pre-releases with release.mjs --prerelease (#754)
- 29f2a22 **observability:** scrape and alert on pods, nodes, MySQL, MongoDB and Redis (#643)

#### Fix

- 39b1345 **k8s:** send the kind canary gate traffic in bursts so it gets a stable share through the edge-proxy keep-alive pool (#726)
- 212babb **k8s:** keep the single-replica data StatefulSets of staging-local running across releases (#707)
- d505627 **k8s:** apply the SealedSecret before the migrations whenever it adds a key (#705)
- 0e57abb **k8s:** surge before removing a pod in every single-replica-capable Deployment (#706)
- 5821e3a **github-actions:** stop the deploy before any apply when the live deploy-app Role is older than app-role.yaml (#721)
- 289e1a6 **github-actions:** fail early with the admin command when the overlay's ClusterRoles are not in the cluster (#710)
- be756e8 **github-actions:** make the first staging deploy pass: kubectl version, persistent runner, timeouts of the local kind staging (#686)
- 711b7dd **observability:** bound Loki retention, persist Jaeger traces, limit collector memory and alert on Loki (#630)

#### Docs

- 558db75 **docs:** publish the Art. 13 notice for API callers and make the controller fields a production prerequisite (#752)

#### Test

- c4c718f **k8s:** measure service continuity during the kind upgrade N-1 to N (#712)
- 860cdf3 **tests:** add an E2E suite from a short training run to the model download (#692)
- ffd932e **tests:** add a soak scenario, a GA generation benchmark and a capacity procedure (#666)

#### Chore

- dced237 **scripts:** reinstate a ratcheted gate for import cycles and application layer isolation (#723)
- 563072f **tests:** make Stryker mutation testing runnable and run it weekly (#687)

#### Ci

- 7aa2080 **github-actions:** retry the kind download and print rollout diagnostics (#685)
- 619e627 **github-actions:** back up the SealedSecrets keys of the local kind staging on its self-hosted runner (#689)
- 8532d70 **github-actions:** type-check the test files of every workspace (#688)

#### Security

- 051bce5 **k8s:** restrict MongoDB audit and DLQ port 27017 to their listed clients (#727) (#746)
- 9297676 **k8s:** seal MYSQL_EXPORTER_PASSWORD and REDIS_EXPORTER_PASSWORD into the staging-local SealedSecret (#704)


## [3.0.0] - 2026-11-08

### @trading-model/http (1.0.0 → 1.1.0)

#### Feat

- 7d207c0 **http:** add correlationId, trace_id, span_id, service and instance to every log line (#624)

#### Fix

- ca9a8d8 **http:** apply LOG_LEVEL to the global logger instead of forcing WARN in production (#617)

#### Perf

- d5ac60a **http:** cache the SVID PEM bundle and reread only when a file changes (#581)

#### Security

- 7305a4c **http:** mask partial sensitive keys and log the path only on server errors (#639)

### @trading-model/server-utils (1.0.0 → 1.1.0)

#### Feat

- 4c8962e **server-utils:** add a status_class label to http_request_duration_seconds (#634)

#### Fix

- 2ef7a92 **server-utils:** start the OpenTelemetry SDK before Express and https load, carry traceparent on the bus (#622)

### @trading-model/address-manager (1.3.0 → 1.3.1)

#### Fix

- b98a191 **address-manager:** register the service's APP_VERSION in discovery

#### Perf

- bd73ce9 **address-manager:** share one in-flight discovery lookup per key in EndpointResolver (#586)

#### Refactor

- 7d84c20 **address-manager:** use a single service resolution strategy shared by the gateway and address-manager (#518)

#### Security

- 4bc1eea **address-manager:** strip the trailing slashes of the discovery URL with a loop, not a polynomial regex

### @trading-model/common (1.3.0 → 1.3.1)

#### Refactor

- f2644e8 **common:** move domain error factories to their owning package or service (#520)

### Root

#### Feat

- 1a1e6c4 **k8s:** log edge-proxy requests as JSON with a request id forwarded as X-Correlation-Id (#638)
- b1ad6f3 **k8s:** deploy the staging environment to a local kind cluster through a self-hosted runner (#591)
- 3bad8a6 **k8s:** verify API, fresh data and critical alerts over a window before declaring a deploy successful (#457)
- 42b96c4 **database:** add the out-of-schema retention job for market data and signals (#549)

#### Fix

- 1bd0a0c **scripts:** let adr:check see symbols with an acronym segment again
- 8c0185d **release:** pass the Dockerfile path to the scan build of the tool images (#491)
- e9a9247 **k8s:** keep 2.x Redis clients working through the 3.0.0 upgrade (expand step of the ACL users)
- dbaa5fd **k8s:** run trader-trainer as a singleton: no HPA, one replica, Recreate (#509)
- 00b5bc7 **k8s:** detect failed migration Jobs at once and wait for each rollback rollout (#469)
- 6177e5e **k8s:** shorten the kind job: discovery-server surge-first, forced upgrade fails after 90 s (#487)
- b315353 **observability:** drop HighLatency duplicate of SLOLatencyFastBurn, inhibit per job and on ServiceDown (#633)
- c6cf3bc **observability:** burn-rate SLO alerts over two windows without probes, data freshness SLO (#626)
- c06e2db **observability:** feed every compose datasource and probe the SVID expiry of each service (#629)
- 92b20e0 **observability:** alert when an application service has no scrape target left (#627)
- 73967d2 **observability:** compute the error budget gauge from recording rules and alert below 20% (#625)
- d60ead9 **observability:** make every Grafana dashboard query a metric and label services emit (#623)
- 56d6748 **observability:** empty the Alertmanager title_link so Discord's /slack webhook accepts the alerts (#590)
- a725a82 **observability:** scrape every pod of the K8s services with pod discovery (#578)

#### Perf

- 46b4bed **k8s:** enable gzip compression of JSON responses at the edge-proxy (#584)
- 0605c25 **k8s:** keep edge-proxy connections to the api-gateway alive (#575)
- df5f759 **k8s:** short rollout timeout for the forced-failure leg (#486) (#488)
- 24127ee **database:** make the market data timestamp indexes visible (#572)

#### Refactor

- 2093566 **core:** Remove dead code, unused dependencies and unwired telemetry (#515)
- 200f14f **primitives:** register services under their canonical name, keep legacy aliases readable (release N) (#519)

#### Docs

- 1c2a7ca **tests:** document the k6 SLO and stress thresholds in the load README (#571) (#588)
- 9c3398e **tests:** mark load test rate and stress figures as unmeasured estimates (#587)
- bdc92bd **docs:** correct the trader-trainer rate limit to 1 000 per minute per IP (#550)
- 31bb942 **docs:** propose ADR-0049 downstream context for models and signals without consumer (#511)
- 8394c77 **docs:** Propose a simplification trajectory (ADR-0043, Proposed) (#510)
- 3e9abd6 **docs:** place dlq-service in the messaging context and gate symbols cited in architecture pages (#521)

#### Test

- 3e01786 **scripts:** pin the architecture symbol pattern of adr:check with a self-check (#621)
- 2a1615d **tests:** rewrite the k6 load tests against public routes through the edge-proxy and run a k6 smoke in CI (#573)

#### Chore

- 95cad07 Bump @aws-sdk/client-s3 from 3.1161.0 to 3.1162.0 (#636)
- 4aa8c7a Bump docker/login-action from 4.7.0 to 4.8.0 (#635)
- 8b095de Bump @biomejs/biome from 2.6.4 to 2.6.5 (#637)
- 64fbac4 **scripts:** make the observability gate check dashboard queries, datasources and probe jobs (#632)
- acb3b50 **k8s:** drop the unfed OTel collector metrics pipeline and alert on failed span exports (#642)
- d073261 **k8s:** register the local staging runner once with a registration token (#593)

#### Ci

- 4b61f59 **k8s:** send the kind Pushover pages to the alert sink through a webhook (#514)
- ddac942 **ci:** stop running the CI on push to development, the PR already ran it (#631)

#### Security

- f6c7c20 **k8s:** isolate Redis per service with ACL users, address cache in process, DLQ rate limiter in memory (#516)
- 22c8225 **k8s:** pin SPIRE, spiffe-helper and CSI images by digest (#468)
- 6b32dd0 **docker:** require GRAFANA_PASSWORD in the compose, no admin/admin default (#641)

#### Other

- fac221c **release:** merge development into main — Redis Streams journal, local kind staging, trainer worker thread (#592)
- fdf6a8a **observability:** alert on long trainer event loop blocks (#485)
- fb211fe **github-actions:** refuse a deploy whose trading-model-secrets lacks a Redis ACL password


## [2.2.0] - 2026-11-06

### Root

#### Feat

- 754531a **k8s:** verify market data resumes after a collector release (#464)
- 50ff38c **k8s:** split deploy into least-privilege application and cluster-scope identities (#447)
- a4d9322 **observability:** expose build_info metric and notify deploys and rollbacks (#470)
- 39810c7 **config:** add configuration feature flags with FEATURE_RISK_ADJUSTED_FITNESS kill switch (#453)
- c16addf **database:** restore selected MongoDB namespaces or into a scratch database (#347)
- bc6666c **database:** add verify-restore-k8s.sh to check restored data and run it in the kind drill (#341)
- eb39591 **database:** back up the SealedSecrets controller keys off-site daily and restore them first in a total outage (#338)
- ab36673 **database:** require two age recipients in production and verify the escrow key weekly against the real off-site backups (#337)
- 893f379 **database:** keep GFS backup tiers to cover the 5-year retention of audit and market data (#319)
- 683d91a **database:** archive MySQL binlogs and MongoDB oplogs hourly for point-in-time recovery (#320)

#### Fix

- 2b3d26a **k8s:** fix the two CI timing races (migrations vs MySQL bootstrap, ioredis Sentinel failover) (#443)
- 9106de9 **k8s:** remove secret-rotation CronJob and its write RBAC on Secrets (#454)
- f838d51 **k8s:** run canaries in parallel over one window and gate no-traffic services on readiness (#449)
- e780066 **k8s:** VPA recommendations only and check cluster prerequisites before apply (#448)
- ea97522 **k8s:** stop applies from resetting the replicas of HPA-driven Deployments (#446)
- 0df5023 **k8s:** set Ingress hosts per overlay and refuse example.com in production (#445)
- 7a494f4 **k8s:** version service ConfigMaps by hash and roll deploy back to the recorded revisions (#440)
- 9f3fb77 **docs:** stop versioning generated TypeDoc HTML (ADR-0037) (#401)
- 02a9f88 **observability:** feed the address-manager breaker from publish calls and set its state gauge (#478)
- b2ebe53 **observability:** ignore the surge pod of a rolling update in InstanceCountLow
- fa2e8f5 **database:** lock migrations, resume them per statement and refuse changed files (#459)
- 3b960b0 **database:** keep the stderr of the backup dump commands in the job logs (#344)
- 4f42edb **database:** restore helper pod uses the image of the db-backup CronJob instead of backup-tools:latest (#342)
- 778ae1f **database:** restore every component from one run and refuse mixed runs unless --allow-mixed-runs (#340)
- 0b31e1b **database:** never restore a dump left by a failed backup run (#317)
- 58df43d **scripts:** make migrate-down roll back newest first without wiping migration-files (#441)

#### Docs

- 61b1ffb **k8s:** state that staging latest tags are a render default, deploy.yml deploys digests (#476)
- dfb94a6 **release:** describe the tag-driven release in one page and fix stale workflow_dispatch docs (#387)
- 3c0598e **docs:** rewrite the data corruption runbook around age-encrypted restores (#480)
- 06a062d **docs:** use hotfix/* prefix for urgent hotfix branches in workflow (#474)
- 4b4540e **docs:** fix rollback runbook diff and canary figures, add database rollback procedure (#472)
- 925f496 **docs:** state tested Bun 1.4.4 in setup prerequisites (#368) (#407)
- 49ab469 **docs:** name superseding ADR in index and explain 0014 and 0028 gaps (#406)
- 3ecedd7 **docs:** translate STATE.md to English and use standard Markdown links (#365) (#405)
- 00aab06 **docs:** fix SECURITY.md scope and move vulnerability reporting into it (#378) (#404)
- 65c56e4 **docs:** add error code catalog with cause and expected action (#377) (#403)
- 8e459b4 **docs:** replace message storage node with subscriptions (Redis) in bounded contexts (#376) (#402)
- 28cff1c **docs:** remove stale ESLint and createSecureServer-from-common references (#373) (#399)
- b94505a **docs:** replace compose production deploy with deploy.yml in contributing workflow (#358) (#397)
- 2d150d8 **docs:** align README CI jobs, image count and pre-push steps (#371) (#396)
- 18a3253 **docs:** remove hard-coded ADR count from README and docs index (#369) (#394)
- 2c902be **docs:** state that MySQL is a single primary without failover (#364) (#393)
- a87cfeb **docs:** add C4, K8s deployment and market flow diagrams, fix architecture-standards tables (#363) (#392)
- e0784c5 **docs:** document single-service local development and flag bun run dev as unsupported outside Compose (#390)
- d48cbde **docs:** document the 8 shared packages without docs, add all 11 to TypeDoc (#360) (#389)
- 80cbcab **docs:** fix the shared package inventory in STATE.md, README and CHANGELOG and gate it in deps:check (#359) (#388)
- 061693a **docs:** create .env before the first docker compose up in the README and Quick Start (#382)
- fc21633 **docs:** rewrite the database failover runbook around encrypted restores and the single MySQL primary (#380)
- 76479d5 **docs:** use the client SVID in every on-call and runbook health command (#379)
- 6c90fc0 **docs:** state that the Docker Compose stack is development only and must hold no real data (#349)
- f4ae44a **docs:** list observability stores and their no-backup decision in the backup classification (#348)
- b3ac7a4 **docs:** add runbook for redeploying the platform in another region after a regional loss (#346)
- 679f2fe **observability:** write the missing alert runbooks and require a runbook_url on every rule (#385)
- 1a8c686 **config:** document every environment variable the code reads in ENV.md and gate it in config:check (#384)
- dfd3f0b **api:** explain missing internal OpenAPI specs and unify infrastructure route rule (#370) (#395)

#### Test

- f0aad0b **k8s:** deploy the kind job with the restricted deploy identities (ADR-0041) (#484)
- b4f2eeb **docs:** fix Examples link and fail adr:check on broken relative Markdown links (#372) (#398)
- ca03065 **database:** time every step of the restore drills against a budget and keep a log of DR exercises (#339)
- 5e72b0c **persistence:** make the Sentinel failover DB test deterministic (#465)

#### Chore

- 9b37645 **release:** align service versions on the release version (#471)
- 51e0270 **config:** force LF line endings for YAML, JSON, JS/TS, Markdown and SQL in .gitattributes (#475)
- 3b511e3 **database:** run migrations from a released image with a dedicated MySQL user (#450)
- 3e8f7c8 **deps:** upgrade SPIRE 1.11.3 to 1.15.5 (critical CVEs in spire-tools blocked release v2.1.0) (#466)

#### Ci

- cb2aa0c **k8s:** test an N-1 to N upgrade, a forced failure and the rollback in the kind job (#460)
- 3c22436 **release:** verify that the 9 deploy.yml images resolve after publishing (#439)
- da791fe **ci:** keep Codecov and the keyserver from blocking releases (#458)
- d9fb362 **ci:** run CI on pushes to main and development (#456)
- 45a68e9 **ci:** pin Bun 1.4.4 in CI from a single .bun-version file (#455)
- 51e6576 **github-actions:** deploy the manifests and migrations of the released tag (#442)
- b244b89 **github-actions:** fail production deploys without backup encryption key or off-site copy (#343)
- c94d409 **github-actions:** refuse production deploys whose off-site backup bucket has no Object Lock (#336)

#### Security

- 18b503b **k8s:** address release review #479: deploy-cluster without nodes/proxy, no staging secret fallback, genome evaluation metric (#481)
- ff0bf69 **k8s:** restrict deploy-k8s.sh apply to local development clusters (#473)
- daa5e34 **k8s:** seal staging secrets, relax staging PDBs, restrict staging ingress (#417) (#463)
- 1ec08e5 **k8s:** address PR #444 review: delete secret-rotation leftovers on deploy, cover ECB UNIT branch (#462)
- 8657d9b **ci:** scan, attest and sign release images and verify signatures at deploy (#452)

#### Other

- 010597b **release:** merge development into main — least-privilege deploy identities, SPIRE 1.15.5, trainer event loop fix (#479)
- 2cb4a3b **observability:** route critical alerts to Pushover, scrape compose backup metrics, fix changelog scopes (#467)
- 1ea63a0 **database:** alert on backup-data volume usage and document its storage class (#345)


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
