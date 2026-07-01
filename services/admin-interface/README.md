# Admin Interface

> React SPA providing a web dashboard for the trading-model platform.

## Overview

Admin Interface is a **React 19** single-page application built with **Vite 6** and **MUI 7**. It communicates with the backend exclusively through the **api-gateway** via HTTP (proxied in dev, nginx in production). All authentication is handled via an admin token sent as the `x-api-key` header.

**Key features:**

- **Service Registry** — view registered microservices, instances, health status
- **Message Bus** — inspect DLQ messages, retry/purge
- **Audit Events** — search, filter, and visualize audit logs
- **Job Queue** — monitor pending/in-progress/failed jobs, cancel stuck jobs
- **Training Management** — start/stop training, view results and genome inspection
- **Market Data** — candles chart, order book, tickers
- **Certificate Management** — view and revoke mTLS certificates
- **Cache Management** — inspect and invalidate api-gateway cache
- **Workers** — monitor worker nodes with CPU/RAM load
- **Config Viewer** — inspect service configuration with source badges

## Quick Start

```bash
# Install dependencies (from monorepo root)
npm install

# Start Vite dev server (port 5173)
npm run -w admin-interface dev
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run -w admin-interface dev` | Vite dev server with HMR |
| `npm run -w admin-interface build` | `tsc -b && vite build` |
| `npm run -w admin-interface preview` | Preview production build |
| `npm run -w admin-interface test` | Vitest (all tests) |
| `npm run -w admin-interface test:coverage` | Vitest with 100% coverage |
| `npm run -w admin-interface lint` | ESLint |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| UI Library | MUI 7 (Material-UI) |
| Build Tool | Vite 6 |
| TypeScript | TypeScript 6, ESNext modules |
| Routing | React Router 7 (nested routes) |
| Charts | Recharts 2 |
| i18n | i18next + react-i18next (en/fr) |
| Testing | Vitest 3 + jsdom |
| Coverage | 100% (statements, branches, functions, lines) |
| Linting | ESLint 10 (root config) |

## Project Structure

```
src/
├── api/
│   └── api-client.ts           # HTTP client (fetch-based)
├── components/
│   ├── data-table.tsx           # Generic sortable table with pagination
│   ├── drawer-panel.tsx         # Right-side detail drawer with tabs
│   ├── filter-bar.tsx           # Search + filter controls
│   ├── info-box.tsx             # Informational card
│   ├── layout.tsx               # App shell with sidebar + Outlet
│   ├── modal-confirm.tsx        # Confirmation dialog
│   ├── severity-badge.tsx       # Colored severity chip
│   ├── sidebar.tsx              # Navigation sidebar
│   ├── stats-card.tsx           # Metric card with icon
│   ├── status-badge.tsx         # Colored status chip
├── hooks/
│   ├── use-api.ts               # Generic fetch hook (loading/error/data)
│   ├── use-audit-events.ts      # Paginated audit events
│   ├── use-jobs.ts              # Job list + detail
│   ├── use-services.ts          # Service registry
├── i18n/
│   ├── config.ts                # i18next setup
│   ├── locales/
│   │   ├── en.json              # English translations
│   │   └── fr.json              # French translations
├── pages/
│   ├── audit-events.tsx         # /audit/events
│   ├── cache.tsx                # /cache
│   ├── certificates.tsx         # /certificates
│   ├── config.tsx               # /config
│   ├── dlq.tsx                  # /broker/dlq
│   ├── jobs.tsx                 # /jobs
│   ├── market-data.tsx          # /market-data
│   ├── services.tsx             # /services (default route)
│   ├── training-results.tsx     # /training/results
│   └── workers.tsx              # /workers
├── types/
│   └── dtos.ts                  # Re-exports from @trading-model/common
├── theme.ts                     # MUI theme customization
├── app.tsx                      # App shell + route definitions
└── main.tsx                     # React entry point
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture, component breakdown, and data flow.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_GATEWAY_URL` | `/v1` | Backend API base URL (proxied by Vite/nginx) |
| `VITE_ADMIN_TOKEN` | `''` | Admin token sent as `x-api-key` header |
