import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { initializeTelemetry, shutdownTelemetry } from "../config/telemetry";
import { createServer } from "./server";
import "../infrastructure/config/env";

const NULL_ADDRESS_MANAGER = { stop() {} };

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> =
	NULL_ADDRESS_MANAGER as ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;

createBootstrap({
	name: "Message Manager",
	createServer,
	onStart: () => {
		initializeTelemetry();
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();
	},
	onStop: async () => {
		addressManager.stop();
		await shutdownTelemetry();
	},
});
