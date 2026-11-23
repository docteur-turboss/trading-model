import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import {
	createRiskExecutionApp,
	type RiskExecutionApp,
} from "../config/container";

let _app: RiskExecutionApp | null = null;

createBootstrap({
	name: "Risk Execution",
	createServer: async () => {
		_app = await createRiskExecutionApp();
		return _app.server;
	},
	onStop: async () => {
		_app?.stop();
		await shutdownTelemetry();
	},
});
