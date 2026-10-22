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
}

/**
 * Builds the Binance scrape cron, or null when no symbol is tracked.
 * Lazy: the cron pulls in node-cron and the worker pipeline only when needed.
 */
export async function createScrapeScheduler(
	settings: ScrapeSchedulerSettings
): Promise<{ start(): void } | null> {
	const symbols = settings.SYMBOLS_TO_TRACK.map(TradingSymbol.of);
	if (symbols.length === 0) {
		return null;
	}
	const { BinanceCronOrchestrator } = await import(
		"../adapters/inbound/cron/binance.cron.js"
	);
	return new BinanceCronOrchestrator({
		schedule: settings.SCRAPE_INTERVAL,
		symbols,
	});
}
