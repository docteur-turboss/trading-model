import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import {
	createModelEvaluatorApp,
	type ModelEvaluatorApp,
} from "../config/container";

let _brokerMessage: ModelEvaluatorApp["brokerMessage"] | null = null;
let _addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | null = null;

createBootstrap({
	name: "Model Evaluator",
	createServer: async () => {
		const { server, brokerMessage } = await createModelEvaluatorApp();
		_brokerMessage = brokerMessage;
		return server;
	},
	onStart: () => {
		_addressManager = BOOTSTRAP_ADDRESS_MANAGER();
	},
	onStop: async () => {
		await _brokerMessage?.stopMessageManager();
		_addressManager?.stop();
		await shutdownTelemetry();
	},
});
