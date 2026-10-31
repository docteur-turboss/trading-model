import { logger } from "@trading-model/http/infrastructure/logger";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { MarketDataModel } from "../adapters/outbound/persistence/market-data.model";
import { createMarketDataController } from "../application/market-data.controller";
import type { WorkerOrchestratorDeps } from "../application/worker-orchestrator";

/** Market data persistence use case backed by the MySQL repository. */
export const MarketDataController = createMarketDataController(MarketDataModel);

/**
 * Wires the scrape cycle: market data source, broker publisher, persistence
 * and the publish backlog (both MySQL).
 * Lazy: the source and the broker client are only needed on the collector.
 */
export async function createWorkerOrchestratorDeps(): Promise<WorkerOrchestratorDeps> {
	const [
		{ BinanceMarketDataSource },
		{ BrokerMarketDataPublisher },
		{ MySqlCandlePublishBacklog },
	] = await Promise.all([
		import("../adapters/outbound/binance/binance-market-data-source.js"),
		import("../adapters/outbound/broker/broker-market-data.publisher.js"),
		import("../adapters/outbound/persistence/candle-publish-backlog.js"),
	]);
	return {
		source: new BinanceMarketDataSource(),
		publisher: new BrokerMarketDataPublisher(),
		persist: (snapshot) => MarketDataController.persist(snapshot),
		backlog: MySqlCandlePublishBacklog,
	};
}

export interface ScrapeSchedulerSettings {
	/** Cron expression of the scrape cycle. */
	SCRAPE_INTERVAL: string;
	SYMBOLS_TO_TRACK: string[];
	/** False on HTTP-only replicas: a single collector instance runs the cron. */
	SCRAPE_SCHEDULER_ENABLED: boolean;
}

/**
 * Builds the scrape cron, or null when this instance does not collect
 * (scheduler disabled, or no symbol tracked — the latter logged as a warning).
 * Lazy: the cron pulls in node-cron and the worker pipeline only when needed.
 */
export interface ScrapeScheduler {
	start(): void;
	/** Stops the cron and waits for the publishes in flight. */
	stop(): Promise<void>;
}

export async function createScrapeScheduler(
	settings: ScrapeSchedulerSettings
): Promise<ScrapeScheduler | null> {
	if (!settings.SCRAPE_SCHEDULER_ENABLED) {
		logger.info(
			"Scrape scheduler disabled (SCRAPE_SCHEDULER_ENABLED=false): serving HTTP only"
		);
		return null;
	}
	const symbols = settings.SYMBOLS_TO_TRACK.map(TradingSymbol.of);
	if (symbols.length === 0) {
		logger.warn(
			"SYMBOLS_TO_TRACK is empty: market data collection is disabled"
		);
		return null;
	}
	logger.info("Market data collection enabled", {
		symbols,
		schedule: settings.SCRAPE_INTERVAL,
	});
	const [{ ScrapeCronOrchestrator }, deps] = await Promise.all([
		import("../adapters/inbound/cron/scrape.cron.js"),
		createWorkerOrchestratorDeps(),
	]);
	return new ScrapeCronOrchestrator({
		schedule: settings.SCRAPE_INTERVAL,
		symbols,
		deps,
	});
}
