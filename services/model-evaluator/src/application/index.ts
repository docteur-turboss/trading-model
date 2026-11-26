import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { DurationMs } from "@trading-model/primitives/primitives";
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
	// Grace 120 s: preStop 10 s, 5 s forced exit; the longest bus handler is 85 s.
	shutdown: {
		onStopTimeoutMs: DurationMs.of(95_000),
		deadlineMs: DurationMs.of(100_000),
	},
	onStop: async () => {
		await _brokerMessage?.stop();
		await shutdownTelemetry();
	},
});
