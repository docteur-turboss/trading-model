import "./telemetry";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { createTraderTrainerContainer } from "../config/container";
import { MessageManager } from "../config/message-manager";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const NULL_ADDRESS_MANAGER = {
	stop() {
		// Intentional no-op.
	},
};

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> =
	NULL_ADDRESS_MANAGER as ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;

const CONTAINER = createTraderTrainerContainer(ENV);

const { trainer, eventHandler, trainingLoop, symbols, models } = CONTAINER;

/** MODEL_DOWNLOAD_CALLERS, comma-separated service names (ADR-0022). */
const MODEL_DOWNLOAD_CALLERS = parseCommaSeparated(ENV.MODEL_DOWNLOAD_CALLERS);

createBootstrap({
	name: "Trader Trainer",
	createServer: () =>
		createServer(trainer, { models, downloadCallers: MODEL_DOWNLOAD_CALLERS }),
	onStart: async () => {
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();

		// Broker messages are emitted under their topic (the MarketEvent value).
		const intents = eventHandler.getSubscribedIntents();
		for (const event of intents) {
			MessageManager.on(event, (data) => eventHandler.handleEvent(event, data));
		}

		await MessageManager.intents(intents);

		await trainer.rehydrate(symbols);

		trainingLoop.start({
			symbols,
			intervalMs: 60_000,
			maxDataAgeMs: ENV.TRAINER_MAX_DATA_AGE_MS,
		});
	},
	onStop: async () => {
		trainingLoop.stop();
		addressManager.stop();
		await MessageManager.stopMessageManager();
		await shutdownTelemetry();
	},
});
