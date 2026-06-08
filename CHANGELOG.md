## [2.0.0] - 2026-06-08

### discovery-server (1.1.0 → 1.1.1)

#### Fix

- 9ece2df **discovery-server:** fix asHandler type to match Express 5 RequestHandler signature

### @trading-model/common (1.1.0 → 1.2.0)

#### Feat

- 23635bf **common:** Extends httpclient for support delete request
- 3e221a6 **common:** Add the 204 http response to responseException
- e5d5e65 **common:** Basic express service installation
- f58a3c2 **common:** Create the communication module of the architecture
- 9a3904c **common:** Add write file in logger system
- 001ee5f **common:** Add Gone response on ClassResponseException
- 5302e10 **common:** Add logger feature
- a1e7c38 **common:** Add the worker (fetch candle history data)
- e700348 **common:** Add engines logic to the jobs (cron & worker)
- ab1d015 **common:** Add chats models
- 79e6918 **common:** Develop the common lib
- 3c707b8 **common:** First commit I guess

#### Fix

- cfe1799 **common:** fix JSON.stringify circular reference in logger
- 42d9589 **common:** fix HttpClient PEM cert loading and AddressManager this binding
- 04ad1f2 **common:** add /ping healthcheck and curl for container healthchecks
- 72abab4 **common:** Remove the previous project file
- 20f76fd **common:** Remove a lot of unused work
- d6e43cd **common:** Remove unused vars on services types

#### Refactor

- 8086f93 **common:** centralize duplicated code, add comprehensive JSDoc, improve TypeScript patterns (#66)
- 1668c70 **common:** derive types from const (MarketType/SourceType), computed EventMap keys, export ServiceInstanceName type, fix key-name bugs in schemas/tests
- fa2bb7e **common:** centralize ServiceInstance, makePRNG, message-manager config, rateLimit, loadTlsConfig, PING_PATH, sleep, trader-trainer env, naming bug, hosts.json endpoint

#### Docs

- 391f3af **common:** Add some documentation file and update the todo list
- a1a4327 **common:** Add documentation in code
- b2ba632 **common:** Add more contexte to the documentation of lib
- 181994f **common:** Add architecture.md

#### Test

- 07860f9 **common:** Update tests file for passing
- f83a250 **common:** Work on middleware tests, still 3 failed
- ffb21a0 **common:** Correct the async issue on tests
- 01534bc **common:** Correct import of tests
- e2e7026 **common:** Fix Gone response via the test error
- 536ecb1 **common:** Add tests everywhere

#### Chore

- e034f02 **common:** ➕ Add zod to lib
- 33aa9fb **common:** ♻️ Move the deliverymode in the lib
- 5c945ee **common:** ✏️ Fix the promise / misconception return of AM bootstrap
- 2d21fff **common:** 🐛 Fix import type problem
- 540f132 **common:** ✏️ Fix the response type problem on the reponseProtocole
- a7e2043 **common:** 🧑‍💻 Remove the old initialisation for a new one
- b4cd3c4 **common:** 🧪 Writes tests, still have 8 failed on 205
- e063735 **common:** 🐛 Fix import and others bugs
- 6d2bc26 **common:** 📦️ Update mock loading on jest
- 0e25827 **common:** 🤡 Update the mock & helper for tests
- 671176c **common:** 🚚 Migrate from /api to /controller
- 50e1ce7 **common:** ➕ Add express-rate-limit
- a0b4a87 **common:** 🙈 Update package and add ssh keys ignore
- b3c7755 **common:** Initialize README with project details and guidelines
- c0342c4 **common:** Enhance SECURITY.md with comprehensive security policy
- 6b70d73 **common:** Rename LICENSE to LICENSE.md file
- 63b09f2 **common:** Add PolyForm Noncommercial License 1.0.0
- a72bc37 **common:** 🗑️ Remove the adress-manager section
- 204ec55 **common:** 🐛 Fix the type module issue
- ed636eb **common:** 💚 Fix export lib in package
- 2e8b555 **common:** 🐛 Fix jest implementation
- 45f6246 **common:** ♻️ Remove not usefull comment and reduce size code
- fea46bc **common:** 💩 Initialisation code ChatGPT suggest
- 9abb8d7 **common:** ✏️ Fix the Candlestick spelling in code
- 4ece8f6 **common:** 🏷️ Update charts types & add sleep function
- 966f909 **common:** ➕ Add node_cron
- e7d855f **common:** 🚚 Add handlecoreresponse to lib
- 7d7e2fb **common:** 🚚 Migrate the structure file
- 8d27f50 **common:** Initial commit

#### Security

- d7dacad **common:** ️ Fix the sessionId security issue on generate random id

#### Other

- cd98fe8 **common:** End of the day commit
- e5dcaab **common:** Update the documentation on the file i'm working on
- 6737fa4 **common:** End of the day staging
- 2af2094 **common:** Segment the index, add express & cron job init + documentation
- f3e8703 **common:** Introduce new helper
- 8ff88a1 **common:** Rewrite the controller & the unit tests
- 3e74a5f **common:** Work on index service discovery
- d0a786b **common:** Work on the mtls middleware
- 8c217bd **common:** Add cron job file
- cbf4540 **common:** Add tests files
- 6384e07 **common:** Write the discovery service -not finish-
- b18eb2f **common:** Work on the models
- 88e0803 **common:** Change the TODO style

### trader-service (1.3.0 → 1.4.0)

#### Feat

- 1a2aa9c **trader-trainer:** Add trader trainer module with full test coverage and infrastructure improvements

#### Test

- d0a0c4a **trader-trainer:** set minimum test coverage to 80%

### @trading-model/address-manager (1.1.0 → 1.2.0)

#### Feat

- 0369e7a **address-manager:** Multiples changes on address Manager

#### Fix

- d2c22b5 **address-manager:** resolve double-encoding in ResponseProtocole and service resolution in AddressManager (#64)

#### Chore

- 2d79470 **address-manager:** 🔊 Change console.log to logger.info in addressmanager index
- 2835ac8 **address-manager:** 🐛 Export address-manager problem

#### Other

- 1f77547 **address-manager:** Implement address-manager library core (unverified)
- 3b3a9df **address-manager:** Work on client address manager lib

### message-manager (1.1.0 → 1.1.1)

#### Fix

- 6389e6a **message-manager:** fix path alias and this binding in broker configs

### financial-scraper (1.1.0 → 1.2.0)

#### Feat

- 542e3a9 **financial-scraper:** Add the binance cron & worker
- ef4fe4a **financial-scraper:** Add the Service Discovery Server

#### Docs

- 19bf308 **financial-scraper:** add VM host setup guide and beta server inventory

#### Chore

- 7e3c029 **financial-scraper:** Add all possible binance asset
- 881104c **financial-scraper:** Move the deps on financial-scrapper
- 1b929b0 **financial-scraper:** Update dependancies from Trader & Financial_scrapper

#### Other

- 34462b0 **financial-scraper:** Update the server and api type
- b4a5f3d **financial-scraper:** Introduce routes, normalizer and controllers
- efcf5a1 **financial-scraper:** Introduce the models and schema on financial scrapper
- 27c1287 **financial-scraper:** Write the route code
- 78294fd **financial-scraper:** Write api scrapper

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
