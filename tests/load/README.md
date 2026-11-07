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

## Scripts

| Script                           | Route (all `GET`)                                | Thresholds |
| -------------------------------- | ------------------------------------------------ | ---------- |
| `scenarios/candles.js`           | `/v1/financial-scraper/candles/symbols/BTCUSDT`  | SLO        |
| `scenarios/discovery-services.js`| `/v1/discovery-server/services`                  | SLO        |
| `scenarios/audit-events.js`      | `/v1/audit-logger/events`                        | SLO        |
| `k6/smoke-test.js`               | the three above                                  | SLO        |
| `k6/stress-test.js`              | the three above, up to 100 VUs                   | stress (P95 < 5 s, errors < 5 %), not the SLO |

SLO thresholds (`docs/operations/slo.md`): `checks rate>0.99`, `http_req_duration p(95)<2000`, `http_req_failed rate<0.01`.

## CI

The `e2e` job of `ci.yml` runs the smoke after the E2E suites (image pinned by tag and digest) and archives `k6-summary.json` (`--summary-export`) as the artifact `k6-summary`. The E2E overlay stubs Binance, so numbers there prove the thresholds hold on a small runner, not capacity.

## Not covered

- **Message bus throughput** (`/message` is service-to-service, mTLS SPIFFE): manual only, from inside the stack with `docker exec` and an SVID, like the mesh helpers of `tests/e2e/helpers.ts`. No k6 script today.
- Capacity ceilings (audit performances C1, M3, M6) are not measured yet: run the scenarios and the stress test on a production-sized host and record the results here.
- K8s cluster load tests.
