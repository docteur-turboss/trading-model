import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import {
	createRiskExecutionApp,
	type RiskExecutionApp,
} from "../config/container";

let _app: RiskExecutionApp | null = null;
let _addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | null = null;

createBootstrap({
	name: "Risk Execution",
	createServer: async () => {
		_app = await createRiskExecutionApp();
		return _app.server;
	},
	onStart: () => {
		_addressManager = BOOTSTRAP_ADDRESS_MANAGER();
	},
	onStop: async () => {
		_app?.stop();
		await _addressManager?.stop();
		await shutdownTelemetry();
	},
});
