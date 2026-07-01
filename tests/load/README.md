# Load Tests

Performance and capacity testing for the trading-model platform using [k6](https://k6.io).

## Prerequisites

```bash
# Install k6
# macOS:  brew install k6
# Linux:  apt install k6  |  rpm -i k6-*.rpm
# Win:    choco install k6

# Or use Docker:
docker pull grafana/k6
```

## Running Tests

```bash
# API Gateway health test
k6 run tests/load/scenarios/api-gateway-health.js

# Message publish test
k6 run tests/load/scenarios/message-publish.js

# Discovery registration test
k6 run tests/load/scenarios/discovery-register.js

# With custom env
k6 run -e API_GATEWAY_URL=https://staging.example.com -e ADMIN_TOKEN=your-token tests/load/scenarios/api-gateway-health.js

# Docker-based
docker run --rm -i -v $PWD/tests/load:/tests grafana/k6 run /tests/scenarios/api-gateway-health.js
```

## Scenarios

| Scenario                | Description                             | Target RPS | P95 Target |
| ----------------------- | --------------------------------------- | ---------- | ---------- |
| `api-gateway-health.js` | Serial health checks ramping 10→100 VUs | 100        | <2s        |
| `message-publish.js`    | Serial message publishing 5→20 VUs      | 20         | <3s        |
| `discovery-register.js` | Service registration 5→10 VUs           | 10         | <1s        |

## Capacity Targets

Based on SLO definitions (`docs/standards/SLO.md`):

| Metric       | Target                     |
| ------------ | -------------------------- |
| Availability | 99.9% (43m downtime/month) |
| P95 Latency  | <2s                        |
| Error Rate   | <1%                        |

## Running a Full Capacity Test

```bash
# All scenarios sequentially
for scenario in api-gateway-health message-publish discovery-register; do
  echo "=== Running $scenario ==="
  k6 run "tests/load/scenarios/${scenario}.js"
done
```

## CI Integration

Add to CI workflow:

```yaml
- name: Load test (staging)
  run: |
    k6 run tests/load/scenarios/api-gateway-health.js \
      -e API_GATEWAY_URL=https://staging-api.example.com \
      -e ADMIN_TOKEN=${{ secrets.STAGING_ADMIN_TOKEN }}
```

## Interpreting Results

- **http_req_duration (p95)**: If >2s, investigate upstream latency or resource limits
- **http_req_failed**: If >1%, check error logs and circuit breaker status
- **vus**: Shows how many virtual users were running at peak
- **iterations**: Total requests completed
