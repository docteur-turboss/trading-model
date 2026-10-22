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
