import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	TradingSymbol,
	toInstanceId,
} from "@trading-model/common/domain/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";
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
		initializeTelemetry({
			serviceName: ServiceInstanceName.FinancialScraperService,
			serviceVersion: process.env.APP_VERSION ?? "1.0.0",
			instanceId: toInstanceId(
				process.env.INSTANCE_ID ?? "financial-scraper-1"
			),
			otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
		});
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
	onStop: async () => {
		addressManager.stop();
		await shutdownTelemetry();
	},
});
