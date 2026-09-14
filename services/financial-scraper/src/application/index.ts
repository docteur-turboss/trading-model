import { TradingSymbol } from "@trading-model/common/domain/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const NULL_ADDRESS_MANAGER = { stop() {} };

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> =
	NULL_ADDRESS_MANAGER as ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;

createBootstrap({
	name: "Financial Scraper",
	createServer,
	onStart: async () => {
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();

		const symbols = ENV.SYMBOLS_TO_TRACK.map(TradingSymbol.of);
		if (symbols.length > 0) {
			const { BinanceCronOrchestrator } = await import(
				"../job/cron/binance.cron.js"
			);
			const orchestrator = new BinanceCronOrchestrator({
				schedule: ENV.SCRAPE_INTERVAL,
				symbols,
			});
			orchestrator.start();
		}
	},
	onStop: () => {
		addressManager.stop();
	},
});
