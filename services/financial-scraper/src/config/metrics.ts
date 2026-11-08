import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

export const SCRAPE_CYCLES_TOTAL = new promClient.Counter({
	name: "fs_scrape_cycles_total",
	help: "Total scrape cron cycles",
	labelNames: ["result"] as const,
});

export const SCRAPE_DURATION_SECONDS = new promClient.Histogram({
	name: "fs_scrape_duration_seconds",
	help: "Duration of a full scrape cycle in seconds",
	buckets: [1, 5, 10, 30, 60, 120, 300],
});

export const SYMBOLS_SCRAPED_TOTAL = new promClient.Counter({
	name: "fs_symbols_scraped_total",
	help: "Symbol scrapes that succeeded, per symbol (series born at 0 for every tracked symbol)",
	labelNames: ["symbol"] as const,
});

export const SYMBOLS_FAILED_TOTAL = new promClient.Counter({
	name: "fs_symbols_failed_total",
	help: "Symbol scrapes that failed, per symbol (series born at 0 for every tracked symbol; see SymbolMarketDataStale)",
	labelNames: ["symbol"] as const,
});

export const SNAPSHOT_PARTS_FAILED_TOTAL = new promClient.Counter({
	name: "fs_snapshot_parts_failed_total",
	help: "Market data parts (order book, candles...) a symbol scrape failed to fetch; the other parts are kept",
	labelNames: ["part"] as const,
});

export const UNPUBLISHED_CANDLES = new promClient.Gauge({
	name: "fs_unpublished_candles",
	help: "Candles persisted to MySQL but not yet published to the bus, per symbol (sent from MySQL, oldest first)",
	labelNames: ["symbol"] as const,
});

export const PUBLISHES_SKIPPED_TOTAL = new promClient.Counter({
	name: "fs_publishes_skipped_total",
	help: "Symbol publishes skipped because the previous one is still in flight (candles stay in the backlog)",
});

export const BINANCE_REQUESTS_TOTAL = new promClient.Counter({
	name: "fs_binance_requests_total",
	help: "Total Binance API requests",
	labelNames: ["endpoint", "status"] as const,
});

export const BINANCE_REQUEST_DURATION_SECONDS = new promClient.Histogram({
	name: "fs_binance_request_duration_seconds",
	help: "Binance API request latency in seconds",
	labelNames: ["endpoint"] as const,
	buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const CANDLES_PERSISTED_TOTAL = new promClient.Counter({
	name: "fs_candles_persisted_total",
	help: "Candle rows persisted to MySQL, per symbol (series born at 0 for every tracked symbol; alerts MarketDataStale, SymbolMarketDataStale)",
	labelNames: ["symbol"] as const,
});

export const TRADES_PERSISTED_TOTAL = new promClient.Counter({
	name: "fs_trades_persisted_total",
	help: "Total trade rows persisted to MySQL",
});

export const TICKERS_PERSISTED_TOTAL = new promClient.Counter({
	name: "fs_tickers_persisted_total",
	help: "Total ticker rows persisted to MySQL",
});

export const EVENTS_PUBLISHED_TOTAL = new promClient.Counter({
	name: "fs_events_published_total",
	help: "Total market data events published to message bus",
	labelNames: ["event_type"] as const,
});

export const SIGNAL_COLLECTIONS_TOTAL = new promClient.Counter({
	name: "fs_signal_collections_total",
	help: "Signal source requests collected (ADR-0036), by source and result: success, fetch_error, invalid_payload (format changed), store_error",
	labelNames: ["source", "result"] as const,
});

export { metricsHandler };
