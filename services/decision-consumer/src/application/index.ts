import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { createDecisionConsumerApp } from "../config/container";

let _stop: (() => void) | null = null;
let _addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | null = null;

createBootstrap({
	name: "Decision Consumer",
	createServer: async () => {
		const { server, stop } = await createDecisionConsumerApp();
		_stop = stop;
		return server;
	},
	onStart: () => {
		_addressManager = BOOTSTRAP_ADDRESS_MANAGER();
	},
	onStop: async () => {
		_stop?.();
		await _addressManager?.stop();
		await shutdownTelemetry();
	},
});
