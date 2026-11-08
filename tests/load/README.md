# Load Tests

[k6](https://k6.io) tests of the public API, through the **edge-proxy** (compose host port 8449): the only external entry (ADR-0018). Services accept only SPIFFE mTLS clients, so k6 never targets a service or gateway port. Every route is in `PUBLIC_ROUTES` (`services/api-gateway/src/shared/public-routes.ts`); every check requires `status == 200`.

| Variable   | Default                 | Meaning                                                      |
| ---------- | ----------------------- | ------------------------------------------------------------ |
| `BASE_URL` | `http://localhost:8449` | Edge-proxy URL                                               |
| `API_KEY`  | empty                   | A key of `GATEWAY_AUTH_TOKENS` (E2E overlay: `e2e-api-key`) |

Without a valid `API_KEY` the gateway answers 401: the checks fail and k6 exits non-zero.

## Run

```bash
# Stack: docker compose -f docker-compose.yml -f tests/e2e/docker-compose.e2e.yml up -d --build --wait ...
k6 run -e API_KEY=e2e-api-key tests/load/k6/smoke-test.js      # 30 s, 2 VUs (what CI runs)
k6 run -e API_KEY=e2e-api-key tests/load/scenarios/candles.js  # 2 min ramp to 25 VUs
# Docker: docker run --rm -i --network host -v $PWD/tests/load:/load grafana/k6:1.4.0 run -e API_KEY=... /load/k6/smoke-test.js
```

Tear the stack down afterwards: `docker compose -f docker-compose.yml -f tests/e2e/docker-compose.e2e.yml down -v`.

## Rate limit (429)

The gateway limits each IP (`RATE_LIMIT_MAX` per minute, default 100). The E2E overlay sets 2 000: enough for the smoke only (2 VUs, ~240 req/min). Beyond that the gateway answers 429, the `status == 200` checks fail and the run measures the limiter, not the latency.

Rates below are estimated from the script configuration (VUs, `sleep`), written 2026-11-08. They are not measured: no run has recorded them.

| Script                              | Estimated rate (one IP, not measured)  | Needs `RATE_LIMIT_MAX` |
| ----------------------------------- | -------------------------------------- | ---------------------- |
| `k6/smoke-test.js`                  | ~240 req/min                           | 2 000 (overlay as is)  |
| `scenarios/*.js`                    | 25 VUs, `sleep(0.5)`: ~50 req/s = ~3 000 req/min | 5 000 |
| `k6/stress-test.js`                 | 100 VUs, no sleep: bounded by latency (no measured figure) | 1 000 000 (effectively off) |

For the scenarios and the stress test, raise the limit with an extra compose file (the overlay value is not changed, CI keeps 2 000):

```yaml
# rate-limit-load.yml
services:
  api-gateway:
    environment:
      RATE_LIMIT_MAX: '1000000'
```

```bash
docker compose -f docker-compose.yml -f tests/e2e/docker-compose.e2e.yml -f rate-limit-load.yml up -d --build --wait ...
```

## Scripts

| Script                           | Route (all `GET`)                                | Thresholds |
| -------------------------------- | ------------------------------------------------ | ---------- |
| `scenarios/candles.js`           | `/v2/financial-scraper/candles/symbols/BTCUSDT`  | SLO        |
| `scenarios/discovery-services.js`| `/v1/discovery-server/services`                  | SLO        |
| `scenarios/audit-events.js`      | `/v1/audit-logger/events`                        | SLO        |
| `k6/smoke-test.js`               | the three above                                  | SLO        |
| `k6/stress-test.js`              | the three above, up to 100 VUs                   | stress (see below; objective, not measured), not the SLO |
| `k6/soak-test.js`                | the three above, constant `SOAK_VUS`, `SOAK_DURATION` | SLO on the first and last 10 % (see Soak) |

**SLO thresholds** (`docs/operations/slo.md`, shared as `SLO_THRESHOLDS` in `lib/public-api.js`): `checks rate>0.99`, `http_req_duration p(95)<2000`, `http_req_failed rate<0.01`. A run that breaks them violates the SLO.

**Stress thresholds** (`k6/stress-test.js`, declared in its header comment): `checks rate>0.95`, `http_req_duration p(95)<5000` and `p(99)<10000`, `http_req_failed rate<0.05`. They are deliberately looser: the stress test finds the load at which the system breaks, not whether it meets the SLO. A stress run that passes them can still violate the SLO, so never report it as SLO evidence.

## Capacity campaign (operator procedure)

Run on a production-sized host. Nothing here is run by CI; no figure is committed until an operator measures it.

1. **Prepare the host.** Free disk (Docker Desktop shares C: with other projects: `df -h /c`, keep 20 GB free), no other compose stack (container names are fixed `trading-*`), `.env` filled from `.env.example`. Stack up with the E2E overlay plus the rate-limit override above (`RATE_LIMIT_MAX: '1000000'` for stress and scenarios; for the soak see below).
2. **Scenarios**: `k6 run -e API_KEY=e2e-api-key --summary-export=out/<name>.json tests/load/scenarios/<file>.js` for each of the three.
3. **Stress**: `k6 run -e API_KEY=e2e-api-key --summary-export=out/stress.json tests/load/k6/stress-test.js`. Never report it as SLO evidence.
4. **Soak** (4 to 8 h):
   ```bash
   bash tests/load/soak-monitor.sh out/soak.csv 5 &      # samples every 5 min
   k6 run -e API_KEY=e2e-api-key -e SOAK_DURATION=4h --summary-export=out/soak.json tests/load/k6/soak-test.js
   kill %1
   ```
5. **GA benchmark**: `bun services/trader-trainer/bench/ga-generation.bench.ts > out/ga-bench.json` (twice: generations and fitness must match).
6. **Record**: fill the table below (date, commit, host, figure), keep the raw files (`out/*`) outside the repository or attach them to the issue. Then tear down: `docker compose -f docker-compose.yml -f tests/e2e/docker-compose.e2e.yml down -v --rmi local`.

### Soak

`k6/soak-test.js`: constant load, `SOAK_VUS` (default 2, ~240 req/min; same rate as the smoke, so `RATE_LIMIT_MAX` 2 000 is enough, scale it with `SOAK_VUS`) for `SOAK_DURATION` (`90s`, `5m`, `4h`; default `4h`). The run is split in three tagged phases: `start` (first 10 %), `main`, `end` (last 10 %). Thresholds: `checks rate>0.99`, error rate < 1 % and p95 < 2 s on `start` and on `end`. Read the drift by comparing `http_req_duration{phase:start}` and `{phase:end}` p95 in the summary: the thresholds only fail on an SLO breach, not on a slow drift inside the limit.

`soak-monitor.sh <out.csv> [minutes] [prefix]`: CSV `timestamp,kind,name,value` with the RSS of every `trading-*` container (`rss_bytes`), the message-manager journal per topic/service (`journal_pending`, `journal_oldest_age_s`, from the `mm_journal_*` gauges, read from inside the container with its SVID), free disk of C: (`disk_free_gb`) and `journal_error` when the metrics could not be read. A leak is an RSS column that keeps growing between samples; a backlog is a `journal_pending` that does not return to 0.

### GA benchmark

`services/trader-trainer/bench/ga-generation.bench.ts` (bun, outside Jest and `src`, never run in CI): `runInProcess` on fixed synthetic data (random walk, 2 windows) with fixed seeds. Env: `BENCH_GENERATIONS` (10), `BENCH_POPULATION` (20), `BENCH_EPISODES` (1), `BENCH_STEPS` (500 bars per window), `BENCH_SEED` (0, added to the PRNG seeds). JSON on stdout:

| Field | Meaning |
| ----- | ------- |
| `config`, `env` | Parameters and runtime/platform |
| `generationsRun`, `bestFitness` | Deterministic for the same `config`: must be equal across runs |
| `totalMs`, `msPerGeneration`, `medianMsPerGeneration` | Wall time; machine dependent, same order of magnitude across runs (generation cost follows genome size, so it varies inside a run) |
| `heapUsedStartBytes`, `heapUsedPeakSampleBytes`, `heapUsedEndBytes`, `rssEndBytes` | Heap sampled at each generation start; the peak is a sample, not a true maximum |

### Results

Empty on purpose: fill it from a real run, never from the estimates above.

| Date | Commit | Host | Test | Result | Raw file |
| ---- | ------ | ---- | ---- | ------ | -------- |
|      |        |      | scenarios (3) | | |
|      |        |      | stress: max VUs under the stress thresholds | | |
|      |        |      | soak: p95 start / end, error rate, RSS growth per container, journal max pending | | |
|      |        |      | GA bench: median ms/generation, heap peak, generations | | |

## CI

The `e2e` job of `ci.yml` runs the smoke after the E2E suites (image pinned by tag and digest) and archives `k6-summary.json` (`--summary-export`) as the artifact `k6-summary`. The E2E overlay stubs Binance, so numbers there prove the thresholds hold on a small runner, not capacity.

## Not covered

- **Message bus throughput** (`/message` is service-to-service, mTLS SPIFFE): manual only, from inside the stack with `docker exec` and an SVID, like the mesh helpers of `tests/e2e/helpers.ts`. No k6 script today.
- Capacity ceilings (audit performances C1, M3, M6) are not measured yet: follow "Capacity campaign" on a production-sized host and record the results in the table.
- K8s cluster load tests.
