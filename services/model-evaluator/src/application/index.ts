import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import {
	createModelEvaluatorApp,
	type ModelEvaluatorApp,
} from "../config/container";

let _brokerMessage: ModelEvaluatorApp["brokerMessage"] | null = null;

createBootstrap({
	name: "Model Evaluator",
	createServer: async () => {
		const { server, brokerMessage } = await createModelEvaluatorApp();
		_brokerMessage = brokerMessage;
		return server;
	},
	onStop: async () => {
		await _brokerMessage?.stopMessageManager();
		await shutdownTelemetry();
	},
});
