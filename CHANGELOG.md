## [2.0.3] - 2026-06-08

### financial-scraper (1.2.0 → 1.2.1)

#### Fix

- 6776f2e **financial-scraper:** fix p-limit dynamic import type reference for v7.x


## [2.0.2] - 2026-06-08


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
