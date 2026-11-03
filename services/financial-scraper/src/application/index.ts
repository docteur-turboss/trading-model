import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import {
	createScrapeScheduler,
	type ScrapeScheduler,
} from "../config/container";
import { closeDatabase } from "../config/db";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const NULL_ADDRESS_MANAGER = {
	stop() {
		// Intentional no-op.
	},
};

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> =
	NULL_ADDRESS_MANAGER as ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;
let scrapeScheduler: ScrapeScheduler | null = null;

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

		scrapeScheduler = await createScrapeScheduler(ENV);
		scrapeScheduler?.start();
	},
	onStop: async () => {
		// Before leaving discovery: the publishes in flight still need the bus.
		await scrapeScheduler?.stop();
		addressManager.stop();
		await shutdownTelemetry();
		// Last: the cycle and the publishes in flight used it.
		await closeDatabase();
	},
});
