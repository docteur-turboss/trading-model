## [3.1.0-rc.3] - 2026-11-17

### @trading-model/http (1.1.0 → 1.2.0)

#### Feat

- 9c24ba7 **http:** trace MySQL, MongoDB and Redis client calls (#1481)
- aa0fe0c **http:** count outbound calls refused by the shared circuit breaker (#991)

#### Fix

- 0e5231d **http:** stop tracing /ping, /health/ready and /metrics requests (#1453)
- 266a7a9 **http:** label gateway requests by public route and extend outbound latency buckets to 30 s (#1388) (#1404)
- eadd7a5 **http:** decode response bodies as UTF-8 on the stream (#1046)
- 39b878d **http:** remove the test-only logger buffer, never-set request and server options and redundant sanitizer patterns (#1042)
- e23aeba **http:** make the outbound request timeout a total deadline and bound the error webhook fetch (#981)
- 38af666 **http:** count only target unavailability as a circuit breaker failure (#922)

#### Perf

- f8e78dd **http:** drop the hidden 1000/min per-IP limiter from configureApp (#1396)

#### Refactor

- 44e1dc5 **http:** remove the processId and userId the logger never writes (#1485)
- ae19e2d **http:** Remove the error webhook that posts every error log (#1402)
- 056e8e0 **http:** merge server-utils into http (#1203, ADR-0074) (#1243)

### @trading-model/broker-message (1.2.0 → 1.3.0)

#### Feat

- b20eb1b **broker:** move the bus delivery, journal and dead-letter metrics into the library and run handlers in the publisher trace (#1462)
- 4f0cd86 **broker:** skip a message already delivered by messageId in the shared callback controller (#925)

#### Fix

- aec1333 **broker:** carry the caller's correlation id on bus messages and restore it around the listeners (#1463)
- a799df5 **broker:** remove publishDirectMessage, post.direct, off, removeAllListeners and dead metadata setters (#1077)
- 3153b2a **broker:** valider les événements training et dlq dans EVENT_VALIDATORS (#949)

#### Perf

- be3f340 **broker:** refill bus consumer slots instead of waiting for the slowest entry of a batch (#1397)
- d972b02 **broker:** run the journal WAIT on its own connection and cap the streams (#1398)

#### Refactor

- ba0c21b **broker:** publish and consume the bus journal in process, dead letters in dead streams (#1250)

### @trading-model/validation (1.0.0 → 1.0.1)

#### Refactor

- 07a6336 **validation:** move the served Signal schema to the shared wire package (#1364)

### @trading-model/address-manager (1.3.1 → 1.3.2)

#### Fix

- 6750119 **address-manager:** keep a new pod out of readiness until it has registered with discovery (#1110)
- c75d13b **address-manager:** count failed heartbeats by merging HeartbeatFailureHandler into HeartbeatManager (#1041)
- 7a6fcd0 **address-manager:** serve the last known address during a discovery outage and decouple readiness from discovery (#919)

#### Refactor

- fa6dfb2 **address-manager:** replace the five single-caller builders with one container and shorten the discovery chain (#1043)
- f933c90 **address-manager:** remove the in-process circuit persistence, the never-fed call tracker and the no-op health checker hooks (#1035)

### @trading-model/common (1.3.1 → 1.3.2)

#### Fix

- 09673d6 **common:** remove the single-implementation cache port, unused retry options and dead error helpers (#1071)

#### Refactor

- 244d6df **common:** read caught errors through normalizeError and a shared hasCode/errorProp guard (#793)

#### Chore

- b140b75 **common:** remove ignoreDeprecations and the unused wildcard paths mapping (#799)

### @trading-model/crypto (1.0.0 → 1.0.1)

#### Refactor

- bea374d **crypto:** remove the unused allowSlidingExpiry path from the instance token validator (#996)

### Root

#### Feat

- f79c2fb **k8s:** log upstream status and connect/response times in the edge-proxy access log
- 3355773 **k8s:** move the SPIRE server datastore to SQLite on its own volume, SVID TTL 4 h (#820)
- e21dfca **k8s:** limiter le débit par adresse client à l'edge-proxy (#865)
- 0a57cc9 **observability:** link Jaeger traces to their Loki logs in Grafana (#1487)
- 80f4f11 **observability:** show gateway per-target latency and errors and signal source state on the dashboards, drop unread metrics (#1466)
- 24585e4 **observability:** alert on API key authentication failures and mTLS ACL denials (#899)
- e91abbf **observability:** give Grafana per-person accounts through OIDC with Viewer as default role (#835)
- 89f7c49 **observability:** alert when a partitioned StatefulSet stays on an old revision (#829)
- 8d0bfd2 **observability:** run Prometheus and Alertmanager with two replicas in production (#826)
- 90371c7 **observability:** page when the trainer stores no model for hours (#816)
- 29f2a22 **observability:** scrape and alert on pods, nodes, MySQL, MongoDB and Redis (#643)
- e1026e3 **database:** give market_order_books its own retention (RETENTION_ORDER_BOOKS_DAYS) (#994)
- 07adabb **release:** publish vX.Y.Z-rc.N pre-releases with release.mjs --prerelease (#754)
- 19160e8 **backup:** purge rows past their retention right after a MySQL restore (#838)

#### Fix

- f5b7e73 **k8s:** generate the configs of the partitioned staging-local observability StatefulSets with a hash suffix (#1465)
- 20f5ce0 **k8s:** keep the partitioned staging-local mysql-0 on a MySQL config its 3.0.0 template can serve (#1458)
- 6609bda **k8s:** cap the Node heap at 192 MiB on the 256 Mi services (#1407)
- fcf17bd **k8s:** make the kind trainer-checkpoints hostPath writable by uid 10001 (#1277)
- 3ef1882 **k8s:** éviter l'OOMKill de Jaeger au démarrage de Badger (#1278) (#1303)
- 9d45a93 **k8s:** remove the one-member MySQL Group Replication config, mysql-cluster-init Job and repl user (#1216)
- 6106566 **k8s:** accorder events get/list/watch à deploy-app pour diagnose (#1197) (#1215)
- bd6e0f9 **k8s:** warn instead of failing on a mysql-cluster-init Job left Failed (#1201)
- b73027e **k8s:** retirer HMAC_SECRET des SealedSecrets après v3.1.0-rc.2 (#1081) (#1200)
- 2c3d0a6 **k8s:** keep the recorded N-1 revisions until a deploy or its rollback succeeds (#1196)
- e4aabfe **k8s:** roll Redis after the Deployments so the previous release keeps its registry during the upgrade (#1158)
- 2478476 **k8s:** replace the stuck pods of a rolled-back Redis StatefulSet (#1142) (#1152)
- 9318df3 **k8s:** apply the Redis certificates before redis-first rolls the Redis StatefulSets (#1138) (#1151)
- 821c5b2 **k8s:** accept an existing root user in the mongodb-bootstrap sidecar under --transitionToAuth (#1107)
- 9c0fdff **k8s:** keep the staging-local database clients on the TLS the partitioned MySQL and MongoDB pods serve (#1073)
- d84ac96 **k8s:** schedule the daily db-backup job next to backup-data and give it a deadline (#1053)
- 9869e95 **k8s:** repair the k8s CI jobs: MongoDB root on an empty cluster, lease expiry during a release, restore drill audit trail (#1004)
- 3e906a4 **k8s:** restart edge-proxy once the api-gateway canary is routed (#987)
- efc1d2e **k8s:** drop the Grafana PDB that blocks node drains and refuse such PDBs in production (#983)
- ffa745d **k8s:** retirer HMAC_SECRET des SealedSecrets, ci-render et init-sealed-secrets (#868)
- def5b06 **k8s:** hold staging-local observability StatefulSets by a partition (#709) (#830)
- 41a57c2 **k8s:** label the mysql-cluster-init pod so the MySQL NetworkPolicy admits it (#781)
- 39b1345 **k8s:** send the kind canary gate traffic in bursts so it gets a stable share through the edge-proxy keep-alive pool (#726)
- 212babb **k8s:** keep the single-replica data StatefulSets of staging-local running across releases (#707)
- d505627 **k8s:** apply the SealedSecret before the migrations whenever it adds a key (#705)
- 0e57abb **k8s:** surge before removing a pod in every single-replica-capable Deployment (#706)
- 9eebc28 **observability:** exclude probes and scrapes from the latency SLO and drop the error alerts duplicating the availability burn rates (#1452)
- ada6660 **observability:** point alert runbook links at the deployed release (#939) (#990)
- aa7a562 **observability:** alert on failed-notification ratio, not a single transient failure (#841)
- 711b7dd **observability:** bound Loki retention, persist Jaeger traces, limit collector memory and alert on Loki (#630)
- 4d3fbf2 **multiple:** stop the in-process bus consumer from acking topics no listener handles (#1488)
- 765f810 **multiple:** stop the in-process bus consumer from acking topics no listener handles (#1492)
- 1f1e50f **multiple:** SPIRE entries at the 4 h TTL of ADR-0065 and Jaeger startup within its memory limit (#1249, #1247) (#1251)
- 5f59831 **multiple:** remove the release 3.0.0 transition aliases and REDIS_ALLOW_LEGACY_CLIENTS (#801)
- 5d62e43 **database:** widen the market data ids to BIGINT UNSIGNED (#1400)
- 4d912f0 **database:** keep the current MongoDB users when restore-k8s.sh restores a full dump (#1055)
- 7709e61 **docker:** restrict compose promtail to the containers of its own compose project (#1461)
- b368cfa **docker:** build the backup-tools image on oraclelinux 10-slim (#1191) (#1198)
- 31a434e **docker:** lower the compose Jaeger MEMORY_MAX_TRACES to 5000 so the in-memory store fits its 1 GiB limit (#979)
- d060da5 **release:** fail --publish when commit, tag or push fails and check the tag on origin (#773)
- 8ce796a **docs:** delete orphaned STATE.md and unused spec template (#1120)
- c68b01c **deploy:** start spiffe-helper as a native sidecar so services wait for the SVID (#1338)
- c029fae **deploy:** relever la limite mémoire de Jaeger et poser GOMEMLIMIT (#1279) (#1304)
- 65a68b5 **model-runtime:** check the exposure cap at the fill price (#1334)
- 69d1783 **github-actions:** let the staging environment deploy the release tags v* (#1190)
- 9cca3b7 **github-actions:** skip the Bind MySQL users step in a preflight deploy run (#1153)
- 5821e3a **github-actions:** stop the deploy before any apply when the live deploy-app Role is older than app-role.yaml (#721)
- 289e1a6 **github-actions:** fail early with the admin command when the overlay's ClusterRoles are not in the cluster (#710)
- be756e8 **github-actions:** make the first staging deploy pass: kubectl version, persistent runner, timeouts of the local kind staging (#686)
- 4fbaf8e **scripts:** delete the unused scripts/run-migrations.sh wrapper (#1146) (#1157)
- 3d99c95 **scripts:** remove restore support for backups without run manifest, GTID statements or per-pod archives (#1083)
- 538ce59 **scripts:** replace the custom TypeDoc theme with typedoc.json, drop docs:generate from release.mjs (#1040)
- be23c24 **scripts:** refuse encrypt-data-disk --migrate while processes use the mount point (#951)
- 8ee5fe6 **scripts:** rewrite rotate-secrets.sh on the keys services read, with a CI test (#818)
- b6c5949 **examples:** sign the query string in manage-dlq.sh (#1116)
- cc8d3ec **reliability:** remove the never-called call() and isAllowed() of the circuit breaker (#1026) (#1058)
- 79b4372 **reliability:** reopen the circuit on a half-open failure by default (#954)
- 7abab88 **persistence:** use while (true) in sentinel failover db spec (#985)
- 33a6c3e **server-utils:** exit after an uncaught exception within a bounded delay and ignore a second shutdown signal (#918)
- 01d5a2d **jobs:** bound the compose Jaeger memory and scale migration Job deadlines by DEPLOY_TIMEOUT_FACTOR (#763)

#### Perf

- 7ad3527 **multiple:** batch journal claims and DLQ pops, read only the latest model manifest (#1057)
- 163439a **database:** add composite indexes for paged market reads and signals retention (#1401)
- 4cdc550 **github-actions:** skip the k8s restore drill on PRs that do not touch backups, jobs, migrations or SPIRE (#960)

#### Refactor

- d35ee88 **k8s:** remove the unguarded delete command of deploy-k8s.sh (#1186)
- 8e2cc2a **k8s:** contract d'ADR-0040 pour l'ancien datastore SPIRE MySQL (#961)
- c967735 **k8s:** retirer le redémarrage d'edge-proxy après le rollback N-1 du drill kind (#956)
- bc92726 **observability:** keep one copy of the alert rules, Alertmanager config and dashboards (#1486)
- 9b0474d **multiple:** list each package's public entry points in exports and refuse deep imports in arch:check (#1339)
- 67459aa **multiple:** finish the minor and cosmetic audit issues (#1021, #1029, #1207) (#1245)
- 6b7f208 **multiple:** route on Service DNS names and serve API majors in the services (release N of retiring discovery-server) (#1239)
- 7597266 **multiple:** flatten the hexagonal folders of the library packages (#1218)
- e4aac91 **multiple:** replace the cast NULL_ADDRESS_MANAGER objects with an optional address manager (#1044)
- 51c9754 **multiple:** replace inline import() type expressions with import type and lint them (#797)
- 5358238 **multiple:** log through getlogger() in application code as ADR-0015 requires (#794)
- acd4d15 **multiple:** use one naming, suffix and location convention for ports and schema files (#795)
- 6b703fe **multiple:** replace NNN as HttpStatusCode casts with HTTP_STATUS constants and lint them (#676) (#792)
- 07d7b41 **multiple:** stop bypassing branded type invariants with as unknown as casts (#791)
- e242dd7 **deps:** make knip report unused exports and types, drop the export keywords only tests use (#1130)
- 7f807ed **model-runtime:** extract forward pass, feature codec and portfolio simulator into @trading-model/model-runtime (#1188)
- 00e31de **contracts:** retirer les topics de debug example.debug.create et example.show.create du contrat de bus (#1231)
- dd950d3 **contracts:** remove the duplicate market-data barrel and the unused CandleInterval.toMs (#1076)
- 4a1654d **contracts:** remove unread delivery.deduplicationId from contract and publishers (#986)
- 06a277d **contracts:** drop the 305 s publish compatibility timeout (#921)
- 08b5d10 **github-actions:** merge the two kubeconfig steps of deploy.yml and restore its line continuations (#1145) (#1155)
- 1500275 **scripts:** check the off-site lifecycle rules at deploy instead of in the backup job (#1079)
- 243757e **scripts:** share one walk() and one workspace list between the gate scripts (#1024) (#1056)
- 7e512ba **reliability:** share one KubernetesLease and one leadership loop between financial-scraper and trader-trainer (#1039)
- 86d2a28 **primitives:** remove brand methods and files no src calls (#1036)

#### Docs

- 43ba5a2 **multiple:** fix the six severity:cosmetique issues (#900)
- 3c18e65 **database:** replace the stale MongoDB section of DATABASE.md with a link to databases.md (#1113)
- 83075c0 **database:** document that the Mongo root password rotates in the database first (#988)
- 263031c **release:** remove the stale first-release section of release.md (#1115)
- 01788a2 **adr:** record the owner's decision to keep order books (ADR-0053, #1383) (#1424)
- bbc7c5f **docs:** drop the 32-feature claim from model-runtime descriptions (#1420)
- c1a6905 **docs:** add model-evaluator to the README, drop stale service and image counts (#1371)
- 7149cfd **docs:** rank the Binance market data terms and propose Bitstamp as second source (#1291) (#1324)
- 6bf33d3 **docs:** propose the multi-asset trainer architecture ADR (#1292) (#1325)
- 95eaa96 **docs:** propose ADR-0073, the message bus as a Redis Streams library with dead streams (ADR-0046 step 4) (#1242)
- cb7f845 **docs:** accept ADR-0046 steps 2 and 4 (retire discovery-server, Redis Streams as a library) (#1202) (#1234)
- d3074da **docs:** remove the circular Quick Start link of the contributing index (#1230)
- 7686fed **docs:** report vulnerabilities to security-report@horus-turboss.fr (#1187)
- 548bd82 **docs:** say in ADR-0039 that a flag change rolls the Deployment through its hashed ConfigMap (#1144) (#1154)
- 0d5ffb1 **docs:** keep one list of the .env secrets to replace, in the quickstart, with the MongoDB passwords (#1128)
- 8aab1f4 **docs:** reduce the service READMEs to links to docs/services, ENV.md and the test command (#1117)
- f5657ce **docs:** fix three broken anchors and check anchors in adr:check (#1123)
- 78e51b1 **docs:** give the 4 h SVID TTL in the glossary and access-control policy (#1124)
- de39c41 **docs:** replace the commit scope table with a link to the enforced list (#1122)
- 15c1205 **docs:** fix stale rows of the troubleshooting guide, add MongoDB auth failure (#1121)
- b5c4b11 **docs:** fix stale descriptions in the deployment index and end overview on deploy.yml (#1119)
- 2eecd72 **docs:** remove false README feature claims and the copied pre-push lists (#1118)
- a7bda31 **docs:** remove the fictional .env loading order and fix the AUTH_TOKENS example (#1114)
- f4b4cfd **docs:** point adding-a-service.md at a real Dockerfile and list the integration points the gates check (#1109)
- d14e8ef **docs:** describe the Bun build and Node runtime of the service images (#1108)
- ec52f1f **docs:** name the releases that kept the 305 s publish bound in ADR-0048 (#1002)
- 383917d **docs:** remove the Codecov upload the CI no longer does from AGENTS.md, README and CI docs (#999)
- 0ad526c **docs:** describe the Redis message journal as durable state in DR, continuity and retention docs (#989)
- 44d5d01 **docs:** say when the local kind staging cluster may be stopped between deploys and what stops with it (#975)
- 392126f **docs:** Add the production capacity and the paid dependencies to the Kubernetes guide (#971)
- 6840b83 **docs:** define the loss limits and the kill switch policy, triggers and drill required before any execution (#903)
- 16fc12c **docs:** make a passing MT4 walk-forward, paper trading included, a blocking prerequisite to real capital (#890)
- 72db0ea **docs:** ADR-0064 risk and execution context required before any order flow (#889)
- 235c96f **docs:** aligner les canaux de communication d'incident sur la config Alertmanager (#871)
- d810a86 **docs:** require a functional contact e-mail for signal sources and register the flow (#742) (#837)
- f112bb7 **docs:** add the Art. 33(5) breach register template (#741) (#836)
- 8c5a5a6 **docs:** replace fictional on-call escalation and PrometheusRule silence with real procedures (#823)
- 8872895 **docs:** state that database client traffic is not encrypted in the cluster (ADR-0060) (#770)
- 0588fc6 **docs:** mark the RTS 6 controls that do not exist as not implemented and gate cited identifiers (#759)
- 4bbb748 **docs:** align the register, DPIA and policies with retention, journal and sanitizer (#756)
- 558db75 **docs:** publish the Art. 13 notice for API callers and make the controller fields a production prerequisite (#752)
- afe0fea **github-actions:** merge the two workflow tables of the CI/CD docs into one (#1127)
- 40953b3 **github-actions:** say CRITICAL or HIGH in the Trivy gate comments of release.yml (#1003)
- 0acdb52 **config:** say unsigned dead letters stay pending in the journal (#1125)
- 28e1b37 **compliance:** assess alert receivers, dead man's switch and S3 stores, check backup bucket region (#765)

#### Test

- c4c718f **k8s:** measure service continuity during the kind upgrade N-1 to N (#712)
- 1d8b7f0 **tests:** remove shared state between its of the DLQ E2E suites (#776)
- cff10b1 **tests:** test Mongo operator injection on public filtered routes and add a ZAP baseline scan to E2E (#777)
- 860cdf3 **tests:** add an E2E suite from a short training run to the model download (#692)
- ffd932e **tests:** add a soak scenario, a GA generation benchmark and a capacity procedure (#666)
- 583334f **server-utils:** run the telemetry order spec against src instead of dist (#786)

#### Chore

- d45c3bb Bump knip from 6.44.2 to 6.45.1 (#1228)
- 270bbd7 Bump @opentelemetry/exporter-trace-otlp-http (#1225)
- 6aced91 Bump @opentelemetry/instrumentation-http (#1222)
- 67abaf6 Bump prometheus/mysqld-exporter from v0.18.0 to v0.21.0 (#1219)
- 4eb3ebd Bump prom/blackbox-exporter from `b04a9fe` to `ea1c7aa` (#1220)
- 9cc4411 Bump redis from `ff02b58` to `1f88291` (#1221)
- 7bffc1b Bump percona/mongodb_exporter from 0.47.1 to 0.54.0 (#1223)
- 10acd7f Bump oliver006/redis_exporter from v1.80.0 to v1.97.0 (#1224)
- 3c59637 Bump @opentelemetry/core from 3.0.0 to 3.1.1 (#1226)
- f075e6c Bump @biomejs/biome from 2.6.5 to 2.6.7 (#1227)
- e941bf3 Bump @aws-sdk/client-s3 from 3.1164.0 to 3.1167.0 (#1182)
- 40675cc Bump node in /services/api-gateway (#1172)
- 5c662fe Bump express-rate-limit from 8.7.3 to 8.7.4 (#1184)
- 1965f91 Bump mysql from `85b9bf2` to `3819b2b` in /deploy/backup (#1170)
- 2fdd157 Bump @opentelemetry/sdk-node from 0.300.0 to 0.301.1 (#1183)
- b745ad7 Bump axios from 1.21.0 to 1.21.1 (#1177)
- 9e76949 Bump alpine from 3.24.3 to 3.24.4 in /deploy/spire (#1175)
- 509adb3 Bump node in /services/discovery-server (#1164)
- 81ae990 Bump node in /services/financial-scraper (#1173)
- 87ece68 Bump grafana/promtail from `b3db8e7` to `6cfa64e` (#1180)
- a3bd5fe Bump busybox from `bdf57e5` to `a46257e` (#1181)
- 17c6a41 Bump prometheus/node-exporter from v1.10.2 to v1.12.1 (#1176)
- 2d1a0fc Bump bitnami/kubectl in /deploy/backup (#1165)
- 3b3ae13 Bump node in /services/message-manager (#1166)
- 81566e4 Bump node in /services/audit-logger (#1168)
- 7e799ad Bump jaegertracing/all-in-one from `7e95912` to `ab6f1a1` (#1178)
- e82c389 Bump node in /services/trader-trainer (#1169)
- b64ea1e Bump @opentelemetry/context-async-hooks from 3.0.0 to 3.1.1 (#1171)
- 138997c Bump node in /services/dlq-service (#1174)
- 92e4774 Bump tecnativa/docker-socket-proxy (#1179)
- f24106c **k8s:** align exporter and redis images with docker-compose, watch deploy/k8s/infra (#1489)
- 2ae3440 **k8s:** replace the audit-logger CPU HPA with a fixed two replicas (#1395) (#1409)
- 8b35f8b **k8s:** set the real production Ingress hosts (#1131) (#1139)
- ef446a8 **k8s:** run a single MySQL pod in production, drop the idle mysql-1 and mysql-2 (#955)
- 1804a42 **k8s:** generate spire agent and server config with a hash suffix (#821) (#869)
- 27d651b **docker:** give every compose service and database the memory limit of its Kubernetes manifest (#929)
- cee4caa **deps:** drop stale knip ignores (config, k6, openssl, kubectl) (#1366)
- 6ad2cbd **deps:** remove unused declared dependencies and check third-party deps in CI (#796)
- 781a49b **github-actions:** run the escrow key check on the staging self-hosted runner while no production bucket exists (#1135) (#1159)
- 8d8779c **github-actions:** remove the Codecov upload, bun run test:coverage is the coverage gate
- dced237 **scripts:** reinstate a ratcheted gate for import cycles and application layer isolation (#723)
- 2fb5926 **config:** passer les clés API par défaut du dépôt au format name:scopes:secret (#839)
- 9748e25 **tests:** build the workspace jest configs from one shared base and drop the dead dlq/ mapping (#1047)
- 563072f **tests:** make Stryker mutation testing runnable and run it weekly (#687)

#### Ci

- 722b17e **docker:** fail CI when a compose file publishes a port on every interface (#859)
- 1ade1a1 **release:** block release images on fixed HIGH vulnerabilities (#872)
- c7cb75c **ci:** show the 5xx breakdown by route in the kind dump (#1425)
- c5a7c93 **github-actions:** fail verify-release only on critical alerts the release raised, not on those firing before the deploy (#1161)
- f733c11 **github-actions:** deploy main as release N-1 in the kind upgrade jobs of every pull request (#1160)
- a27696a **github-actions:** deploy the pull request base as release N-1 in the kind upgrade jobs (#1072)
- 59b8228 **github-actions:** run the kind restore drill on database and audit-trail changes (#1054)
- 4b44175 **github-actions:** back up MySQL before production migrations (#993)
- 8aa00dc **github-actions:** refuse production deploys while realip.inc holds the placeholder pod CIDR (#995)
- fd8e67d **github-actions:** cache bun installs and e2e image layers, skip the kind job on PRs that touch nothing it deploys (#972)
- 699aa14 **github-actions:** couvrir les images deploy et compose avec Dependabot, ajouter bun audit et gitleaks en CI (#958)
- 7af34bd **github-actions:** run CI on direct pushes to development (#948)
- f67c9b8 **github-actions:** require all alert notification secrets in staging too (#867)
- 0022e4a **github-actions:** gate sealed-secrets-key-backup on the fork PR approval setting (#863)
- eb8fa88 **github-actions:** refuse staging deploys unless fork runs need approval of all external contributors (#858)
- aed81ba **github-actions:** add a preflight mode to the Deploy workflow (#817)
- 806c762 **github-actions:** deploy HEAD^1 as the kind release N-1 again (#785)
- c02c233 **github-actions:** upload the coverage of the DB integration specs to Codecov under flag db (#789)
- 74b11c8 **github-actions:** roll back a cancelled deploy and report what a failed pre-overlay deploy left behind (#774)
- faeb208 **github-actions:** detect breaking changes of the public OpenAPI and bus messages against the last release (#654) (#784)
- bb25ac3 **github-actions:** refuse production deploys when the environment is unprotected (#766)
- 7aa2080 **github-actions:** retry the kind download and print rollout diagnostics (#685)
- 619e627 **github-actions:** back up the SealedSecrets keys of the local kind staging on its self-hosted runner (#689)
- 8532d70 **github-actions:** type-check the test files of every workspace (#688)
- 7eb13cf **scripts:** compare bus schemas with the newest release tag holding a snapshot, pre-releases included (#1075)

#### Security

- bfb7c9a **k8s:** reseal the staging-local AUTH_TOKENS in the ADR-0059 format and the MONGO_* keys without a trailing CR
- 6f3b8ca **k8s:** seal the seven MONGO_* keys of ADR-0067 into the staging-local SealedSecret (#1070)
- 691d765 **k8s:** enforce MongoDB authentication, remove --transitionToAuth (#924)
- e929591 **k8s:** TLS preferTLS and cert-manager server certificates for MongoDB (#769) (#927)
- f170b43 **k8s:** TLS and cert-manager client certificates for MySQL (#775)
- ca30fdf **k8s:** enable MongoDB authentication with a keyFile, one user per client and a clusterMonitor exporter user (#715)
- 4033781 **k8s:** vérifier le certificat des kubelets par la CA du cluster (#851) (#876)
- 4bd93a4 **k8s:** limiter l'entrée de l'api-gateway aux appelants réels du port 3000 (#813) (#866)
- 647ab5a **k8s:** dedicated ServiceAccount for the financial-scraper collector Lease right (#714) (#832)
- 30f8695 **k8s:** give the SPIRE server its own MySQL user instead of root (#822)
- b3fd154 **k8s:** restrict MySQL and Redis ports to their listed client components (#747) (#771)
- a4b0abd **k8s:** truncate the real caller IP in the edge-proxy and disable the ingress controller access log (#757)
- 051bce5 **k8s:** restrict MongoDB audit and DLQ port 27017 to their listed clients (#727) (#746)
- 9297676 **k8s:** seal MYSQL_EXPORTER_PASSWORD and REDIS_EXPORTER_PASSWORD into the staging-local SealedSecret (#704)
- 86ea758 **observability:** masquer le login local Grafana quand OIDC est actif (#901)
- 6790bbc **observability:** retirer l'API lifecycle de Prometheus, recharger par SIGHUP (#850) (#875)
- 07fa16f **multiple:** fix the 3 CodeQL alerts of release PR #1428 (#1474)
- 6c57d24 **database:** TLS Redis et Sentinel, étape optional (phase A de #735) (#787)
- f09b254 **database:** TLS Redis et Sentinel, étape optional, suivi dans ADR-0060 (#950)
- 66a20c8 **docker:** route spire-agent and promtail through a read-only docker-socket-proxy (#864)
- 626c4b9 **docker:** bind published compose ports to 127.0.0.1 (#738) (#833)
- 943d609 **deps:** override qs, glob and minimatch to patched versions (#873)
- 0167525 **github-actions:** check branch rules of staging and backup-key-check environments before they release secrets (#862)
- e7aabcb **config:** refuser en production les secrets de moins de 32 caractères ou change-me (#852) (#877)
- 9a44c65 **config:** cap edge-proxy nginx error log at crit so no full client IP reaches Loki (#739) (#834)

#### Other

- d69dfa9 **k8s:** keep HMAC_SECRET in the SealedSecrets until a release that no longer mounts it has shipped (#1080) (#1082)
- c2c5773 **k8s:** keep --transitionToAuth and the SPIRE MySQL rollback rules until a release ships their expand step (#1068) (#1074)
- 9f6eb12 **observability:** page on total training outage and prolonged trainer no-leader (#827)
- fec77d8 **database:** drop the paged read indexes migration 011 until it can build outside the 720 s migration Job (#1475)
- a2d79ae **database:** drop the blocking id widening migration 010 until an online method exists (#1450)
- d48ffd7 **release:** merge main back into development with a merge commit (#1457)
- eefb2d8 **release:** merge main (dependabot bumps #1219-#1228) back into development (#1447)


## [3.1.0-rc.2] - 2026-11-14

### @trading-model/address-manager (1.3.1 → 1.3.2)

#### Fix

- 6750119 **address-manager:** keep a new pod out of readiness until it has registered with discovery (#1110)
- c75d13b **address-manager:** count failed heartbeats by merging HeartbeatFailureHandler into HeartbeatManager (#1041)
- 7a6fcd0 **address-manager:** serve the last known address during a discovery outage and decouple readiness from discovery (#919)

#### Refactor

- fa6dfb2 **address-manager:** replace the five single-caller builders with one container and shorten the discovery chain (#1043)
- f933c90 **address-manager:** remove the in-process circuit persistence, the never-fed call tracker and the no-op health checker hooks (#1035)

### @trading-model/broker-message (1.2.0 → 1.3.0)

#### Feat

- 4f0cd86 **broker:** skip a message already delivered by messageId in the shared callback controller (#925)

#### Fix

- a799df5 **broker:** remove publishDirectMessage, post.direct, off, removeAllListeners and dead metadata setters (#1077)
- 3153b2a **broker:** valider les événements training et dlq dans EVENT_VALIDATORS (#949)

### @trading-model/common (1.3.1 → 1.3.2)

#### Fix

- 09673d6 **common:** remove the single-implementation cache port, unused retry options and dead error helpers (#1071)

#### Refactor

- 244d6df **common:** read caught errors through normalizeError and a shared hasCode/errorProp guard (#793)

#### Chore

- b140b75 **common:** remove ignoreDeprecations and the unused wildcard paths mapping (#799)

### @trading-model/http (1.1.0 → 1.2.0)

#### Feat

- aa0fe0c **http:** count outbound calls refused by the shared circuit breaker (#991)

#### Fix

- eadd7a5 **http:** decode response bodies as UTF-8 on the stream (#1046)
- 39b878d **http:** remove the test-only logger buffer, never-set request and server options and redundant sanitizer patterns (#1042)
- e23aeba **http:** make the outbound request timeout a total deadline and bound the error webhook fetch (#981)
- 38af666 **http:** count only target unavailability as a circuit breaker failure (#922)

### @trading-model/crypto (1.0.0 → 1.0.1)

#### Refactor

- bea374d **crypto:** remove the unused allowSlidingExpiry path from the instance token validator (#996)

### @trading-model/server-utils (1.1.0 → 1.1.1)

#### Fix

- 33a6c3e **server-utils:** exit after an uncaught exception within a bounded delay and ignore a second shutdown signal (#918)

#### Test

- 583334f **server-utils:** run the telemetry order spec against src instead of dist (#786)

### Root

#### Feat

- 3355773 **k8s:** move the SPIRE server datastore to SQLite on its own volume, SVID TTL 4 h (#820)
- e21dfca **k8s:** limiter le débit par adresse client à l'edge-proxy (#865)
- 07adabb **release:** publish vX.Y.Z-rc.N pre-releases with release.mjs --prerelease (#754)
- e1026e3 **database:** give market_order_books its own retention (RETENTION_ORDER_BOOKS_DAYS) (#994)
- 24585e4 **observability:** alert on API key authentication failures and mTLS ACL denials (#899)
- e91abbf **observability:** give Grafana per-person accounts through OIDC with Viewer as default role (#835)
- 89f7c49 **observability:** alert when a partitioned StatefulSet stays on an old revision (#829)
- 8d0bfd2 **observability:** run Prometheus and Alertmanager with two replicas in production (#826)
- 90371c7 **observability:** page when the trainer stores no model for hours (#816)
- 29f2a22 **observability:** scrape and alert on pods, nodes, MySQL, MongoDB and Redis (#643)
- 19160e8 **backup:** purge rows past their retention right after a MySQL restore (#838)

#### Fix

- 5821e3a **github-actions:** stop the deploy before any apply when the live deploy-app Role is older than app-role.yaml (#721)
- 289e1a6 **github-actions:** fail early with the admin command when the overlay's ClusterRoles are not in the cluster (#710)
- be756e8 **github-actions:** make the first staging deploy pass: kubectl version, persistent runner, timeouts of the local kind staging (#686)
- e4aabfe **k8s:** roll Redis after the Deployments so the previous release keeps its registry during the upgrade (#1158)
- 2478476 **k8s:** replace the stuck pods of a rolled-back Redis StatefulSet (#1142) (#1152)
- 9318df3 **k8s:** apply the Redis certificates before redis-first rolls the Redis StatefulSets (#1138) (#1151)
- 821c5b2 **k8s:** accept an existing root user in the mongodb-bootstrap sidecar under --transitionToAuth (#1107)
- 9c0fdff **k8s:** keep the staging-local database clients on the TLS the partitioned MySQL and MongoDB pods serve (#1073)
- d84ac96 **k8s:** schedule the daily db-backup job next to backup-data and give it a deadline (#1053)
- 9869e95 **k8s:** repair the k8s CI jobs: MongoDB root on an empty cluster, lease expiry during a release, restore drill audit trail (#1004)
- 3e906a4 **k8s:** restart edge-proxy once the api-gateway canary is routed (#987)
- efc1d2e **k8s:** drop the Grafana PDB that blocks node drains and refuse such PDBs in production (#983)
- ffa745d **k8s:** retirer HMAC_SECRET des SealedSecrets, ci-render et init-sealed-secrets (#868)
- def5b06 **k8s:** hold staging-local observability StatefulSets by a partition (#709) (#830)
- 41a57c2 **k8s:** label the mysql-cluster-init pod so the MySQL NetworkPolicy admits it (#781)
- 39b1345 **k8s:** send the kind canary gate traffic in bursts so it gets a stable share through the edge-proxy keep-alive pool (#726)
- 212babb **k8s:** keep the single-replica data StatefulSets of staging-local running across releases (#707)
- d505627 **k8s:** apply the SealedSecret before the migrations whenever it adds a key (#705)
- 0e57abb **k8s:** surge before removing a pod in every single-replica-capable Deployment (#706)
- 4fbaf8e **scripts:** delete the unused scripts/run-migrations.sh wrapper (#1146) (#1157)
- 3d99c95 **scripts:** remove restore support for backups without run manifest, GTID statements or per-pod archives (#1083)
- 538ce59 **scripts:** replace the custom TypeDoc theme with typedoc.json, drop docs:generate from release.mjs (#1040)
- be23c24 **scripts:** refuse encrypt-data-disk --migrate while processes use the mount point (#951)
- 8ee5fe6 **scripts:** rewrite rotate-secrets.sh on the keys services read, with a CI test (#818)
- 8ce796a **docs:** delete orphaned STATE.md and unused spec template (#1120)
- b6c5949 **examples:** sign the query string in manage-dlq.sh (#1116)
- d060da5 **release:** fail --publish when commit, tag or push fails and check the tag on origin (#773)
- 4d912f0 **database:** keep the current MongoDB users when restore-k8s.sh restores a full dump (#1055)
- 5f59831 **multiple:** remove the release 3.0.0 transition aliases and REDIS_ALLOW_LEGACY_CLIENTS (#801)
- cc8d3ec **reliability:** remove the never-called call() and isAllowed() of the circuit breaker (#1026) (#1058)
- 79b4372 **reliability:** reopen the circuit on a half-open failure by default (#954)
- ada6660 **observability:** point alert runbook links at the deployed release (#939) (#990)
- aa7a562 **observability:** alert on failed-notification ratio, not a single transient failure (#841)
- 711b7dd **observability:** bound Loki retention, persist Jaeger traces, limit collector memory and alert on Loki (#630)
- 7abab88 **persistence:** use while (true) in sentinel failover db spec (#985)
- 31a434e **docker:** lower the compose Jaeger MEMORY_MAX_TRACES to 5000 so the in-memory store fits its 1 GiB limit (#979)
- 01d5a2d **jobs:** bound the compose Jaeger memory and scale migration Job deadlines by DEPLOY_TIMEOUT_FACTOR (#763)

#### Perf

- 4cdc550 **github-actions:** skip the k8s restore drill on PRs that do not touch backups, jobs, migrations or SPIRE (#960)
- 7ad3527 **multiple:** batch journal claims and DLQ pops, read only the latest model manifest (#1057)

#### Refactor

- 08b5d10 **github-actions:** merge the two kubeconfig steps of deploy.yml and restore its line continuations (#1145) (#1155)
- 8e2cc2a **k8s:** contract d'ADR-0040 pour l'ancien datastore SPIRE MySQL (#961)
- c967735 **k8s:** retirer le redémarrage d'edge-proxy après le rollback N-1 du drill kind (#956)
- 1500275 **scripts:** check the off-site lifecycle rules at deploy instead of in the backup job (#1079)
- 243757e **scripts:** share one walk() and one workspace list between the gate scripts (#1024) (#1056)
- e242dd7 **deps:** make knip report unused exports and types, drop the export keywords only tests use (#1130)
- dd950d3 **contracts:** remove the duplicate market-data barrel and the unused CandleInterval.toMs (#1076)
- 4a1654d **contracts:** remove unread delivery.deduplicationId from contract and publishers (#986)
- 06a277d **contracts:** drop the 305 s publish compatibility timeout (#921)
- e4aac91 **multiple:** replace the cast NULL_ADDRESS_MANAGER objects with an optional address manager (#1044)
- 51c9754 **multiple:** replace inline import() type expressions with import type and lint them (#797)
- 5358238 **multiple:** log through getlogger() in application code as ADR-0015 requires (#794)
- acd4d15 **multiple:** use one naming, suffix and location convention for ports and schema files (#795)
- 6b703fe **multiple:** replace NNN as HttpStatusCode casts with HTTP_STATUS constants and lint them (#676) (#792)
- 07d7b41 **multiple:** stop bypassing branded type invariants with as unknown as casts (#791)
- 7e512ba **reliability:** share one KubernetesLease and one leadership loop between financial-scraper and trader-trainer (#1039)
- 86d2a28 **primitives:** remove brand methods and files no src calls (#1036)

#### Docs

- afe0fea **github-actions:** merge the two workflow tables of the CI/CD docs into one (#1127)
- 40953b3 **github-actions:** say CRITICAL or HIGH in the Trivy gate comments of release.yml (#1003)
- 548bd82 **docs:** say in ADR-0039 that a flag change rolls the Deployment through its hashed ConfigMap (#1144) (#1154)
- 0d5ffb1 **docs:** keep one list of the .env secrets to replace, in the quickstart, with the MongoDB passwords (#1128)
- 8aab1f4 **docs:** reduce the service READMEs to links to docs/services, ENV.md and the test command (#1117)
- f5657ce **docs:** fix three broken anchors and check anchors in adr:check (#1123)
- 78e51b1 **docs:** give the 4 h SVID TTL in the glossary and access-control policy (#1124)
- de39c41 **docs:** replace the commit scope table with a link to the enforced list (#1122)
- 15c1205 **docs:** fix stale rows of the troubleshooting guide, add MongoDB auth failure (#1121)
- b5c4b11 **docs:** fix stale descriptions in the deployment index and end overview on deploy.yml (#1119)
- 2eecd72 **docs:** remove false README feature claims and the copied pre-push lists (#1118)
- a7bda31 **docs:** remove the fictional .env loading order and fix the AUTH_TOKENS example (#1114)
- f4b4cfd **docs:** point adding-a-service.md at a real Dockerfile and list the integration points the gates check (#1109)
- d14e8ef **docs:** describe the Bun build and Node runtime of the service images (#1108)
- ec52f1f **docs:** name the releases that kept the 305 s publish bound in ADR-0048 (#1002)
- 383917d **docs:** remove the Codecov upload the CI no longer does from AGENTS.md, README and CI docs (#999)
- 0ad526c **docs:** describe the Redis message journal as durable state in DR, continuity and retention docs (#989)
- 44d5d01 **docs:** say when the local kind staging cluster may be stopped between deploys and what stops with it (#975)
- 392126f **docs:** Add the production capacity and the paid dependencies to the Kubernetes guide (#971)
- 6840b83 **docs:** define the loss limits and the kill switch policy, triggers and drill required before any execution (#903)
- 16fc12c **docs:** make a passing MT4 walk-forward, paper trading included, a blocking prerequisite to real capital (#890)
- 72db0ea **docs:** ADR-0064 risk and execution context required before any order flow (#889)
- 235c96f **docs:** aligner les canaux de communication d'incident sur la config Alertmanager (#871)
- d810a86 **docs:** require a functional contact e-mail for signal sources and register the flow (#742) (#837)
- f112bb7 **docs:** add the Art. 33(5) breach register template (#741) (#836)
- 8c5a5a6 **docs:** replace fictional on-call escalation and PrometheusRule silence with real procedures (#823)
- 8872895 **docs:** state that database client traffic is not encrypted in the cluster (ADR-0060) (#770)
- 0588fc6 **docs:** mark the RTS 6 controls that do not exist as not implemented and gate cited identifiers (#759)
- 4bbb748 **docs:** align the register, DPIA and policies with retention, journal and sanitizer (#756)
- 558db75 **docs:** publish the Art. 13 notice for API callers and make the controller fields a production prerequisite (#752)
- 0acdb52 **config:** say unsigned dead letters stay pending in the journal (#1125)
- 263031c **release:** remove the stale first-release section of release.md (#1115)
- 3c18e65 **database:** replace the stale MongoDB section of DATABASE.md with a link to databases.md (#1113)
- 83075c0 **database:** document that the Mongo root password rotates in the database first (#988)
- 43ba5a2 **multiple:** fix the six severity:cosmetique issues (#900)
- 28e1b37 **compliance:** assess alert receivers, dead man's switch and S3 stores, check backup bucket region (#765)

#### Test

- c4c718f **k8s:** measure service continuity during the kind upgrade N-1 to N (#712)
- 1d8b7f0 **tests:** remove shared state between its of the DLQ E2E suites (#776)
- cff10b1 **tests:** test Mongo operator injection on public filtered routes and add a ZAP baseline scan to E2E (#777)
- 860cdf3 **tests:** add an E2E suite from a short training run to the model download (#692)
- ffd932e **tests:** add a soak scenario, a GA generation benchmark and a capacity procedure (#666)

#### Chore

- 781a49b **github-actions:** run the escrow key check on the staging self-hosted runner while no production bucket exists (#1135) (#1159)
- 8d8779c **github-actions:** remove the Codecov upload, bun run test:coverage is the coverage gate
- 8b35f8b **k8s:** set the real production Ingress hosts (#1131) (#1139)
- ef446a8 **k8s:** run a single MySQL pod in production, drop the idle mysql-1 and mysql-2 (#955)
- 1804a42 **k8s:** generate spire agent and server config with a hash suffix (#821) (#869)
- dced237 **scripts:** reinstate a ratcheted gate for import cycles and application layer isolation (#723)
- 6ad2cbd **deps:** remove unused declared dependencies and check third-party deps in CI (#796)
- 2fb5926 **config:** passer les clés API par défaut du dépôt au format name:scopes:secret (#839)
- 9748e25 **tests:** build the workspace jest configs from one shared base and drop the dead dlq/ mapping (#1047)
- 563072f **tests:** make Stryker mutation testing runnable and run it weekly (#687)
- 27d651b **docker:** give every compose service and database the memory limit of its Kubernetes manifest (#929)

#### Ci

- c5a7c93 **github-actions:** fail verify-release only on critical alerts the release raised, not on those firing before the deploy (#1161)
- f733c11 **github-actions:** deploy main as release N-1 in the kind upgrade jobs of every pull request (#1160)
- a27696a **github-actions:** deploy the pull request base as release N-1 in the kind upgrade jobs (#1072)
- 59b8228 **github-actions:** run the kind restore drill on database and audit-trail changes (#1054)
- 4b44175 **github-actions:** back up MySQL before production migrations (#993)
- 8aa00dc **github-actions:** refuse production deploys while realip.inc holds the placeholder pod CIDR (#995)
- fd8e67d **github-actions:** cache bun installs and e2e image layers, skip the kind job on PRs that touch nothing it deploys (#972)
- 699aa14 **github-actions:** couvrir les images deploy et compose avec Dependabot, ajouter bun audit et gitleaks en CI (#958)
- 7af34bd **github-actions:** run CI on direct pushes to development (#948)
- f67c9b8 **github-actions:** require all alert notification secrets in staging too (#867)
- 0022e4a **github-actions:** gate sealed-secrets-key-backup on the fork PR approval setting (#863)
- eb8fa88 **github-actions:** refuse staging deploys unless fork runs need approval of all external contributors (#858)
- aed81ba **github-actions:** add a preflight mode to the Deploy workflow (#817)
- 806c762 **github-actions:** deploy HEAD^1 as the kind release N-1 again (#785)
- c02c233 **github-actions:** upload the coverage of the DB integration specs to Codecov under flag db (#789)
- 74b11c8 **github-actions:** roll back a cancelled deploy and report what a failed pre-overlay deploy left behind (#774)
- faeb208 **github-actions:** detect breaking changes of the public OpenAPI and bus messages against the last release (#654) (#784)
- bb25ac3 **github-actions:** refuse production deploys when the environment is unprotected (#766)
- 7aa2080 **github-actions:** retry the kind download and print rollout diagnostics (#685)
- 619e627 **github-actions:** back up the SealedSecrets keys of the local kind staging on its self-hosted runner (#689)
- 8532d70 **github-actions:** type-check the test files of every workspace (#688)
- 7eb13cf **scripts:** compare bus schemas with the newest release tag holding a snapshot, pre-releases included (#1075)
- 1ade1a1 **release:** block release images on fixed HIGH vulnerabilities (#872)
- 722b17e **docker:** fail CI when a compose file publishes a port on every interface (#859)

#### Security

- 0167525 **github-actions:** check branch rules of staging and backup-key-check environments before they release secrets (#862)
- 6f3b8ca **k8s:** seal the seven MONGO_* keys of ADR-0067 into the staging-local SealedSecret (#1070)
- 691d765 **k8s:** enforce MongoDB authentication, remove --transitionToAuth (#924)
- e929591 **k8s:** TLS preferTLS and cert-manager server certificates for MongoDB (#769) (#927)
- f170b43 **k8s:** TLS and cert-manager client certificates for MySQL (#775)
- ca30fdf **k8s:** enable MongoDB authentication with a keyFile, one user per client and a clusterMonitor exporter user (#715)
- 4033781 **k8s:** vérifier le certificat des kubelets par la CA du cluster (#851) (#876)
- 4bd93a4 **k8s:** limiter l'entrée de l'api-gateway aux appelants réels du port 3000 (#813) (#866)
- 647ab5a **k8s:** dedicated ServiceAccount for the financial-scraper collector Lease right (#714) (#832)
- 30f8695 **k8s:** give the SPIRE server its own MySQL user instead of root (#822)
- b3fd154 **k8s:** restrict MySQL and Redis ports to their listed client components (#747) (#771)
- a4b0abd **k8s:** truncate the real caller IP in the edge-proxy and disable the ingress controller access log (#757)
- 051bce5 **k8s:** restrict MongoDB audit and DLQ port 27017 to their listed clients (#727) (#746)
- 9297676 **k8s:** seal MYSQL_EXPORTER_PASSWORD and REDIS_EXPORTER_PASSWORD into the staging-local SealedSecret (#704)
- 943d609 **deps:** override qs, glob and minimatch to patched versions (#873)
- e7aabcb **config:** refuser en production les secrets de moins de 32 caractères ou change-me (#852) (#877)
- 9a44c65 **config:** cap edge-proxy nginx error log at crit so no full client IP reaches Loki (#739) (#834)
- 6c57d24 **database:** TLS Redis et Sentinel, étape optional (phase A de #735) (#787)
- f09b254 **database:** TLS Redis et Sentinel, étape optional, suivi dans ADR-0060 (#950)
- 86ea758 **observability:** masquer le login local Grafana quand OIDC est actif (#901)
- 6790bbc **observability:** retirer l'API lifecycle de Prometheus, recharger par SIGHUP (#850) (#875)
- 66a20c8 **docker:** route spire-agent and promtail through a read-only docker-socket-proxy (#864)
- 626c4b9 **docker:** bind published compose ports to 127.0.0.1 (#738) (#833)

#### Other

- d69dfa9 **k8s:** keep HMAC_SECRET in the SealedSecrets until a release that no longer mounts it has shipped (#1080) (#1082)
- c2c5773 **k8s:** keep --transitionToAuth and the SPIRE MySQL rollback rules until a release ships their expand step (#1068) (#1074)
- 9f6eb12 **observability:** page on total training outage and prolonged trainer no-leader (#827)


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
