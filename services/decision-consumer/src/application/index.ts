import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { createDecisionConsumerApp } from "../config/container";

let _stop: (() => void) | null = null;

createBootstrap({
	name: "Decision Consumer",
	createServer: async () => {
		const { server, stop } = await createDecisionConsumerApp();
		_stop = stop;
		return server;
	},
	onStop: async () => {
		_stop?.();
		await shutdownTelemetry();
	},
});
