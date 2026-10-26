import { logger } from "@trading-model/http/infrastructure/logger";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { MarketDataModel } from "../adapters/outbound/persistence/market-data.model";
import { createMarketDataController } from "../application/market-data.controller";
import type { WorkerOrchestratorDeps } from "../application/worker-orchestrator";

/** Market data persistence use case backed by the MySQL repository. */
export const MarketDataController = createMarketDataController(MarketDataModel);

/** Wires the scrape cycle: Binance worker (fetch + publish) then persistence. */
export const workerOrchestratorDeps: WorkerOrchestratorDeps = {
	runWorker: async (options) => {
		// Lazy: the worker pulls in the broker client, only needed once the cron fires.
		const { BinanceWorker } = await import(
			"../adapters/outbound/binance-worker/binance.worker.js"
		);
		return new BinanceWorker(options).run();
	},
	persist: (result) => MarketDataController.persist(result),
};

export interface ScrapeSchedulerSettings {
	/** Cron expression of the scrape cycle. */
	SCRAPE_INTERVAL: string;
	SYMBOLS_TO_TRACK: string[];
	/** False on HTTP-only replicas: a single collector instance runs the cron. */
	SCRAPE_SCHEDULER_ENABLED: boolean;
}

/**
 * Builds the Binance scrape cron, or null when this instance does not collect
 * (scheduler disabled, or no symbol tracked — the latter logged as a warning).
 * Lazy: the cron pulls in node-cron and the worker pipeline only when needed.
 */
export async function createScrapeScheduler(
	settings: ScrapeSchedulerSettings
): Promise<{ start(): void } | null> {
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
	const { BinanceCronOrchestrator } = await import(
		"../adapters/inbound/cron/binance.cron.js"
	);
	return new BinanceCronOrchestrator({
		schedule: settings.SCRAPE_INTERVAL,
		symbols,
	});
}
