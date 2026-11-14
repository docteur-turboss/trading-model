import "./telemetry";
import type { Leadership } from "@trading-model/reliability/leadership";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { createCollector } from "../config/container";
import { closeDatabase } from "../config/db";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | undefined;
let collector: Leadership | null = null;

createBootstrap({
	name: "Financial Scraper",
	createServer,
	onStart: async () => {
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();

		collector = await createCollector(ENV);
		collector?.start();
	},
	onStop: async () => {
		// Before leaving discovery: the publishes in flight still need the bus.
		// Then the lease goes to the successor (ADR-0057).
		await collector?.stop();
		addressManager?.stop();
		await shutdownTelemetry();
		// Last: the cycle and the publishes in flight used it.
		await closeDatabase();
	},
});
