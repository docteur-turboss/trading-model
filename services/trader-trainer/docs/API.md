# API Reference

## Overview

Trader-Trainer exposes a secure HTTPS API. All endpoints are served via Express behind TLS with rate limiting (100 requests per 15-minute window).

**Base URL**: `https://<service-host>:<PORT>`

---

## Endpoints

### `GET /ping`

Health check endpoint (configured by `createSecureServer`).

**Response** `200 OK`:

```json
{
  "status": "ok",
  "service": "Trader Trainer",
  "timestamp": "..."
}
```

---

### `GET /best-agent`

Returns the best trained agent summary from the most recent generation. If no agent has been trained yet, returns `404`.

**Response** `200 OK`:

```json
{
  "data": {
    "agent": {
      "id": "a1b2c3d4",
      "generation": 42,
      "fitness": 1.8345,
      "sharpe": 1.92,
      "avgPnl": 145.32,
      "negFlops": -123456,
      "complexityPenalty": 0,
      "gaControl": {
        "populationSize": 20,
        "elitismFraction": 0.1,
        "survivorFraction": 0.5,
        "episodesPerIndividual": 3,
        "selectionType": "tournament",
        "fitnessType": "total_pnl"
      },
      "network": {
        "inputDim": 32,
        "outputDim": 3,
        "hiddenLayers": [
          { "neurons": 64, "activation": "ReLu" },
          { "neurons": 32, "activation": "ReLu" }
        ]
      },
      "rl": {
        "gamma": 0.99,
        "learningRate": 0.001,
        "epsilonStart": 1.0,
        "epsilonMin": 0.05,
        "epsilonDecay": 0.995
      }
    },
    "training": false,
    "symbol": "BTCUSDT",
    "generation": 42
  }
}
```

**Response** `404 Not Found`:

```json
{
  "data": {
    "status": 404,
    "message": "No trained agent available at the moment."
  }
}
```

---

### `GET /training-status`

Returns current training state.

**Response** `200 OK`:

```json
{
  "data": {
    "training": true,
    "symbol": "BTCUSDT",
    "generation": 17
  }
}
```

---

### `GET /address-manager/*`

Service discovery and address resolution routes managed by `@trading-model/address-manager`.

---

### `POST /message`

Callback endpoint for the Message Manager event bus (`MessageManagerListenExpress`). Incoming market data events are received here.

---

## Internal Types

### `BestAgentSummary`

| Field             | Type   | Description                              |
| ----------------- | ------ | ---------------------------------------- |
| id                | string | Unique genome identifier                 |
| generation        | number | Generation when this genome was produced |
| fitness           | number | Scalar fitness score                     |
| sharpe            | number | Sharpe-like ratio of episode returns     |
| avgPnl            | number | Average P&L across evaluation episodes   |
| negFlops          | number | Negative FLOPs (complexity indicator)    |
| complexityPenalty | number | Complexity penalty applied to fitness    |
| gaControl         | object | GA meta-parameters used                  |
| network           | object | Neural network architecture              |
| rl                | object | Reinforcement learning hyperparameters   |

---

## Rate Limiting

- **Window**: 15 minutes
- **Limit**: 100 requests per window
- Configured in `createSecureServer` within `server.ts:17-20`

## TLS

All connections require TLS mutual authentication:

- Server key: `TLS_KEY_PATH`
- Server cert: `TLS_CERT_PATH`
- CA bundle: `TLS_CA_PATH`
