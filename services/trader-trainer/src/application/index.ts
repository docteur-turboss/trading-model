import "./telemetry";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import type { Leadership } from "@trading-model/reliability/leadership";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import {
	createTraderTrainerContainer,
	createTrainingLeadership,
} from "../config/container";
import { MessageManager } from "../config/message-manager";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | undefined;
let leadership: Leadership | null = null;

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

		// Every pod serves the read routes; only the Lease holder trains (ADR-0058).
		leadership = createTrainingLeadership(ENV, {
			start: () =>
				trainingLoop.start({
					symbols,
					intervalMs: ENV.TRAINER_INTERVAL_MS,
					maxDataAgeMs: ENV.TRAINER_MAX_DATA_AGE_MS,
				}),
			stop: () => trainingLoop.stop(),
		});
		leadership.start();
	},
	onStop: async () => {
		// Before leaving discovery: the model of the session ended early is
		// published on the bus. Then the Lease goes to the successor.
		await leadership?.stop();
		addressManager?.stop();
		await MessageManager.stopMessageManager();
		await shutdownTelemetry();
	},
});
