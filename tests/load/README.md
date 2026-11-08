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

**SLO thresholds** (`docs/operations/slo.md`, shared as `SLO_THRESHOLDS` in `lib/public-api.js`): `checks rate>0.99`, `http_req_duration p(95)<2000`, `http_req_failed rate<0.01`. A run that breaks them violates the SLO.

**Stress thresholds** (`k6/stress-test.js`, declared in its header comment): `checks rate>0.95`, `http_req_duration p(95)<5000` and `p(99)<10000`, `http_req_failed rate<0.05`. They are deliberately looser: the stress test finds the load at which the system breaks, not whether it meets the SLO. A stress run that passes them can still violate the SLO, so never report it as SLO evidence.

## CI

The `e2e` job of `ci.yml` runs the smoke after the E2E suites (image pinned by tag and digest) and archives `k6-summary.json` (`--summary-export`) as the artifact `k6-summary`. The E2E overlay stubs Binance, so numbers there prove the thresholds hold on a small runner, not capacity.

## Not covered

- **Message bus throughput** (`/message` is service-to-service, mTLS SPIFFE): manual only, from inside the stack with `docker exec` and an SVID, like the mesh helpers of `tests/e2e/helpers.ts`. No k6 script today.
- Capacity ceilings (audit performances C1, M3, M6) are not measured yet: run the scenarios and the stress test on a production-sized host and record the results here.
- K8s cluster load tests.
