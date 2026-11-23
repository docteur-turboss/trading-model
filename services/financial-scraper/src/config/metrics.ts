import { metricsHandler } from "@trading-model/http/metrics-handler";
import promClient from "prom-client";

export const COLLECTOR_LEADER = new promClient.Gauge({
	name: "fs_collector_leader",
	help: "1 while this instance holds the collector lease and collects, 0 otherwise (ADR-0057; alert CollectorNoLeader)",
});

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

export const CANDLES_REJECTED_TOTAL = new promClient.Counter({
	name: "fs_candles_rejected_total",
	help: "Candles dropped at ingestion before persistence, per reason (price_jump: close far outside the rest of the series)",
	labelNames: ["reason"] as const,
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

export const SIGNAL_COLLECTIONS_TOTAL = new promClient.Counter({
	name: "fs_signal_collections_total",
	help: "Signal source requests collected (ADR-0036), by source and result: success, not_modified (304, nothing to store), not_found (404 on a source that opts in: no fact), fetch_error, invalid_payload (format changed), store_error, skipped_quarantine (tick skipped, source in quarantine)",
	labelNames: ["source", "result"] as const,
});

export const SIGNAL_SOURCE_QUARANTINED = new promClient.Gauge({
	name: "fs_signal_source_quarantined",
	help: "1 while a signal source is in quarantine after repeated fetch failures, or Binance after a 429/418/451 (source binance), else 0",
	labelNames: ["source"] as const,
});

export const SIGNAL_SOURCE_DISABLED = new promClient.Gauge({
	name: "fs_signal_source_disabled",
	help: "1 when a signal source is not scheduled (ADR-0036), by source and reason: missing_key (its SIGNAL_KEY_* variable is unset)",
	labelNames: ["source", "reason"] as const,
});

export const SIGNAL_SOURCES = new promClient.Gauge({
	name: "fs_signal_sources",
	help: "Registry sources (ADR-0075) by terms and commercial licence (n/a for free-for-any-use terms)",
	labelNames: ["terms", "commercial_licence"] as const,
});

export const SIGNAL_SOURCE_DAILY_REQUESTS = new promClient.Gauge({
	name: "fs_signal_source_daily_requests",
	help: "Requests a day the schedule of a signal source plans",
	labelNames: ["source"] as const,
});

export const SIGNAL_LAST_SUCCESS = new promClient.Gauge({
	name: "fs_signal_last_success_timestamp_seconds",
	help: "Unix time of the last successful collection of a signal source, restored from MySQL at start; exposed only by the collecting pod (alert SignalSourceStale)",
	labelNames: ["source"] as const,
});

export const SIGNAL_NEWEST_OBSERVED = new promClient.Gauge({
	name: "fs_signal_newest_observed_timestamp_seconds",
	help: "Unix time of the newest observedAt stored for a signal source (a source can answer 200 with old data)",
	labelNames: ["source"] as const,
});

export const SIGNAL_SOURCE_MAX_AGE = new promClient.Gauge({
	name: "fs_signal_source_max_age_seconds",
	help: "Age of the last collection beyond which a signal source is stale (alert SignalSourceStale)",
	labelNames: ["source"] as const,
});

export { metricsHandler };
