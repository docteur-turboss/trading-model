# Diagnostic Guide by Service

Quick-reference for debugging each service: key logs, metrics, health endpoints, and common failure modes.

## 1. Discovery Server

| Aspect              | Details                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Health**          | `GET /ping` → `{"status":"ok"}`                                                                                     |
| **Port**            | 8443 (host) / 3000 (container)                                                                                      |
| **Key logs**        | `[Discovery] Server started`, `Instance registered`, `Lease expired for`, `Heartbeat received`                      |
| **Metrics**         | `discovery_instances_registered`, `discovery_heartbeat_count`, `discovery_lease_expirations`                        |
| **Debug endpoints** | `GET /services` — list all services, `GET /services/:name` — instances per service                                  |
| **Common failures** | Instances not heartbeating → lease expires → service disappears from registry. Check `CLEANUP_SERVICE_INTERVAL_MS`. |

## 2. Message Manager (Broker)

| Aspect              | Details                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Health**          | `GET /ping` → `{"status":"ok"}`                                                                                                  |
| **Port**            | 8444 (host) / 3000 (container)                                                                                                   |
| **Key logs**        | `Message published to topic`, `Delivery attempt`, `Retry backoff`, `Routing to DLQ`, `Circuit breaker opened`                    |
| **Metrics**         | `broker_messages_published`, `broker_delivery_success`, `broker_delivery_failure`, `broker_queue_depth`                          |
| **Debug endpoints** | `GET /api/messages?status=failed` — failed messages, `GET /api/messages/:id` — single message                                    |
| **Common failures** | Subscriber unreachable → retries → DLQ. Check subscriber health and network. Circuit breaker opens after 5 consecutive failures. |

## 3. Workload Identity (SPIRE)

| Aspect              | Details                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Health**          | SPIRE Server: `spire-server healthcheck`; Agent: `spire-agent healthcheck` (ADR-0011)                                                    |
| **Port**            | SPIRE Server gRPC 8081 (cluster-internal); Workload API socket `/run/spire/agent-sockets/public/api.sock`                                 |
| **Key logs**        | Agent: `attesting workload`, `rotating SVID`; Server: `entry registered`, attestor failures                                             |
| **Debug endpoints** | Workload API → `spiffe-helper` writes `svid.pem` / `svid_key.pem` / `bundle.pem`                                                          |
| **Common failures** | Agent cannot reach server → attestation/rotation failures. SVID not found in volume → check `spiffe-helper` sidecar + Workload API socket. |

## 4. Financial Scraper

| Aspect              | Details                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Health**          | `GET /ping` → `{"status":"ok"}`                                                                                              |
| **Port**            | 8445 (host) / 3000 (container)                                                                                               |
| **Key logs**        | `Fetched candles for`, `Binance API rate limit`, `Publishing to bus`, `MySQL write error`                                    |
| **Metrics**         | `scraper_fetch_count`, `scraper_rate_limit_hits`, `scraper_mysql_write_errors`                                               |
| **Debug endpoints** | `GET /trade/symbols/BTCUSDT` — recent trades, `GET /candles/symbols/BTCUSDT?interval=1h` — candles                           |
| **Common failures** | Binance API rate limit → throttled fetches. MySQL connection loss → data not persisted. Check token bucket and MySQL health. |

## 5. Trader Trainer

| Aspect              | Details                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Health**          | `GET /ping` → `{"status":"ok"}`                                                                                                          |
| **Port**            | 8446 (host) / 3000 (container)                                                                                                           |
| **Key logs**        | `Training started`, `Generation`, `Best fitness`, `Market data received`, `Agent exported`                                               |
| **Metrics**         | `trainer_generation`, `trainer_population_size`, `trainer_best_fitness`, `trainer_memory_usage`                                          |
| **Debug endpoints** | `GET /training-status` — current state, `GET /best-agent` — best agent                                                                   |
| **Common failures** | Out of memory → population auto-scaled down. No market data → training stalls. Check `TRAINER_SYMBOLS` and message-manager connectivity. |

## 6. API Gateway

| Aspect              | Details                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Health**          | `GET /ping` → `{"status":"ok","service":"api-gateway"}`                                                                     |
| **Port**            | 8448 (host) / 3000 (container)                                                                                              |
| **Key logs**        | `Proxying request to`, `Authentication failed`, `Rate limit exceeded`, `Cache hit/miss`, `Service unavailable`              |
| **Metrics**         | `gateway_requests_total`, `gateway_errors_5xx`, `gateway_latency_ms`, `gateway_cache_hit_ratio`                             |
| **Debug endpoints** | Proxy only — no direct service endpoints. Check discovery-server for routing resolution.                                    |
| **Common failures** | Invalid `x-api-key` → 401. Service not in registry → 404. Upstream timeout → 503. Check `AUTH_TOKENS` and discovery-server. |

## 7. Audit Logger

| Aspect              | Details                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Health**          | `GET /health` → `{"status":"ok","timestamp":"..."}`                                                                     |
| **Port**            | 8450 (host) / 3000 (container)                                                                                         |
| **Key logs**        | `Recorded audit event`, `Queue depth`, `Worker ACK timeout`, `Back-pressure active`                                    |
| **Metrics**         | `audit_events_total`, `audit_queue_depth`, `audit_worker_count`, `audit_backpressure`                                  |
| **Debug endpoints** | `GET /events/stats` — aggregate stats, `GET /events?limit=10` — recent events                                          |
| **Common failures** | MongoDB connection loss → events not persisted (`/health/ready` 503). Check `MONGODB_URI`.                                |

## 8. DLQ Service

| Aspect              | Details                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Health**          | `GET /health` → `{"status":"ok"}`                                                                                        |
| **Port**            | 8452 (host) / 3000 (container)                                                                                           |
| **Key logs**        | `DLQ entry stored`, `Replaying entry`, `Entry pruned`, `Redis queue degraded`, `Stale claim released`                    |
| **Metrics**         | `dlq_entries_total`, `dlq_replay_count`, `dlq_prune_count`, `dlq_queue_depth`                                            |
| **Debug endpoints** | `GET /dlq` — list entries, `GET /dlq/:id` — single entry                                                                 |
| **Common failures** | MongoDB unavailable → entries rejected. Redis unavailable → degraded mode (no queue). Check `MONGO_URI` and `REDIS_URL`. |

## Quick Commands

```bash
# Check all service health endpoints
# Services only accept SPIFFE mTLS clients (ADR-0011): probe them from inside
# their container, with its SVID (what the compose healthcheck does)
for c in trading-discovery trading-message trading-scraper trading-trainer \
         trading-gateway trading-audit trading-dlq; do
  printf '%s: ' "$c"
  docker exec "$c" curl -sk --cert /run/spire/svid/svid.pem \
    --key /run/spire/svid/svid_key.pem https://localhost:3000/ping; echo
done

# Tail logs for a specific service
docker logs -f trading-discovery   # discovery-server
docker logs -f trading-message     # message-manager
docker logs -f trading-gateway     # api-gateway
docker logs -f trading-scraper     # financial-scraper
docker logs -f trading-trainer     # trader-trainer
docker logs -f trading-audit       # audit-logger
docker logs -f trading-dlq         # dlq-service
```
