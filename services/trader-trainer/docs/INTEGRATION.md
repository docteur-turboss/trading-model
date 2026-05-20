# Integration Guide

## Service Dependencies

### Message Manager (`@trading-model/broker-message`)

The primary data source. Trader-Trainer subscribes to market data events and listens at `/message` callback endpoint.

**Consumed events**:
| Event | Data | Frequency |
|-------|------|-----------|
| `fetchCandlestickSeries` | OHLCV arrays | Periodic |
| `fetchRecentTrades` | Trade arrays | Real-time |
| `fetchOrderBookSnapshot` | Order book depth | Snapshot |
| `fetchOrderBookTickerSnapshot` | Best bid/ask | Real-time |
| `fetch24hrTickerStats` | 24h statistics | Periodic |
| `fetchPriceTickerSnapshot` | Current prices | Real-time |

**Configuration**: All message manager setup in `config/message-manager.ts` using environment variables for TLS, service identity, and callback path.

### Address Manager (`@trading-model/address-manager`)

Service discovery and health monitoring. Every running instance registers with the address manager, which provides:

- Dynamic service endpoint resolution
- Health check pings
- Instance TTL management

**Configuration**: `config/address-manager.ts` reads `ADDRESS_MANAGER_URL` and TLS paths.

### Trader-Executor (Output)

The best trained agent is exposed via the `/best-agent` REST endpoint. The consuming service (Trader-Executor) polls or receives the agent payload:

```typescript
// Consumer side
const response = await fetch('https://trader-trainer:3000/best-agent');
const { data } = await response.json();

// Deploy agent
const agentPayload = {
  agent: data.agent,
  symbol: data.symbol,
  timestamp: Date.now(),
};
```

---

## Deployment Architecture

```
┌──────────────────┐     ┌─────────────────────┐
│  Message Manager  │────▶│   Trader-Trainer    │
│  (market data)   │     │   (training loop)   │
└──────────────────┘     └──────────┬──────────┘
                                    │
                                    ▼
┌──────────────────┐     ┌─────────────────────┐
│  Address Manager │◀───▶│   Trader-Executor   │
│  (discovery)     │     │   (live trading)    │
└──────────────────┘     └─────────────────────┘
```

All inter-service communication is TLS-encrypted with mutual certificate authentication.

---

## Adding a New Market Data Source

To consume additional market data:

1. Add event type to imports in `app/index.ts`
2. Subscribe in the `onStart` handler
3. Add to `MessageManager.intents()` array
4. Process data in `MarketDataBuffer` (add new normalizer if needed)
5. Add feature dimension in `buildFeatures()` if new data is used as input

---

## Exporting Agents to External Systems

The best agent summary (available at `/best-agent`) contains all fields needed to reconstruct and deploy:

```typescript
// Reconstruct agent from summary
const agent = new TradingAgent({
  nnConfig: {
    neuronsByLayer: [
      summary.network.inputDim,
      ...summary.network.hiddenLayers.map(l => l.neurons),
      summary.network.outputDim,
    ],
    activationFunctions: summary.network.hiddenLayers.map(l => l.activation),
  },
  wallet: { initialCash: 1000, initialPrice: 1 },
  actionSpace: 'discrete',
  tradeAmount: 1,
  stateManagerCfg: {
    epsilonStart: summary.rl.epsilonStart,
    epsilonMin: summary.rl.epsilonMin,
    epsilonDecay: summary.rl.epsilonDecay,
    gamma: summary.rl.gamma,
  },
});
```

For complete agent reconstruction (with trained weights), the `trainedWeights` field would need to be exported — this is currently internal but can be added to the API response.

---

## Configuration Reference

### Environment Variables

| Category  | Variable                          | Required | Default           |
| --------- | --------------------------------- | -------- | ----------------- |
| Server    | `PORT`                            | No       | 3000              |
| Server    | `TLS_KEY_PATH`                    | **Yes**  | —                 |
| Server    | `TLS_CERT_PATH`                   | **Yes**  | —                 |
| Server    | `TLS_CA_PATH`                     | **Yes**  | —                 |
| Discovery | `ADDRESS_MANAGER_URL`             | **Yes**  | —                 |
| Discovery | `INSTANCE_ID`                     | **Yes**  | —                 |
| Discovery | `SERVICE_NAME`                    | **Yes**  | —                 |
| Events    | `MESSAGE_CALLBACK_PATH`           | No       | 'message'         |
| Logging   | `LOG_LEVEL`                       | No       | 'info'            |
| Training  | `TRAINER_SYMBOLS`                 | No       | 'BTCUSDT,ETHUSDT' |
| Training  | `TRAINER_DATA_WINDOW`             | No       | 500               |
| Training  | `TRAINER_VALIDATION_SPLIT`        | No       | 0.2               |
| Training  | `TRAINER_GENERATIONS`             | No       | 50                |
| Training  | `TRAINER_POPULATION_SIZE`         | No       | 20                |
| Training  | `TRAINER_TIME_BUDGET_MS`          | No       | 300000            |
| Training  | `TRAINER_EPISODES_PER_INDIVIDUAL` | No       | 3                 |
| Error     | `ERROR_URL_WEBHOOK`               | **Yes**  | —                 |

---

## Health Checks

- **Service ping**: Address manager pings each instance to verify liveness
- **`/ping` endpoint**: Returns 200 when service is alive
- **`/training-status` endpoint**: Shows if training is active, on which symbol, and current generation

---

## Testing

```
npm test          # Run all unit + integration tests
npm test -- --coverage  # With coverage report
```

Test structure:

- `tests/unit/` — Per-module unit tests
- `tests/integration/` — Server integration tests
- `tests/fixtures/` — Test data (market data, genomes)
- `tests/helpers/` — Test utilities (mock env, server helpers)
