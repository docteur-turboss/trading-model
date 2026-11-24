import "./telemetry";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { ScraperSignalHistory } from "@trading-model/model-runtime/signals/scraper-signal-history";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { Leadership } from "@trading-model/reliability/leadership";
import { ScraperCandleHistory } from "../adapters/outbound/scraper-candle-history";
import {
	BOOTSTRAP_ADDRESS_MANAGER,
	FIND_A_SERVICE,
} from "../config/address-manager";
import {
	createTraderTrainerContainer,
	createTrainingLeadership,
} from "../config/container";
import { MessageManager } from "../config/message-manager";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | undefined;
let leadership: Leadership | null = null;

const CONTAINER = createTraderTrainerContainer(
	ENV,
	new ScraperCandleHistory(buildTlsFromEnv(ENV), FIND_A_SERVICE),
	new ScraperSignalHistory(buildTlsFromEnv(ENV), FIND_A_SERVICE)
);

const { trainer, trainingLoop, symbols, models } = CONTAINER;

/** MODEL_DOWNLOAD_CALLERS, comma-separated service names (ADR-0022). */
const MODEL_DOWNLOAD_CALLERS = parseCommaSeparated(ENV.MODEL_DOWNLOAD_CALLERS);

createBootstrap({
	name: "Trader Trainer",
	createServer: () =>
		createServer(trainer, { models, downloadCallers: MODEL_DOWNLOAD_CALLERS }),
	onStart: async () => {
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();

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
	// Grace 120 s: close 5 s + onStop 60 s, 100 s + 5 s forced exit.
	shutdown: {
		onStopTimeoutMs: DurationMs.of(60_000),
		deadlineMs: DurationMs.of(100_000),
	},
	onStop: async () => {
		// Before leaving discovery: the model of the session ended early is
		// published on the bus. Then the Lease goes to the successor.
		await leadership?.stop();
		await addressManager?.stop();
		await MessageManager.stopMessageManager();
		await shutdownTelemetry();
	},
});
