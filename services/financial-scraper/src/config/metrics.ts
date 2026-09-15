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
	help: "Total symbols successfully scraped",
});

export const SYMBOLS_FAILED_TOTAL = new promClient.Counter({
	name: "fs_symbols_failed_total",
	help: "Total symbols that failed scraping",
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
	help: "Total candle rows persisted to MySQL",
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

export { metricsHandler };
