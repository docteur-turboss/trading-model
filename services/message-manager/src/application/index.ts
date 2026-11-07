import { PUBLISH_ACCEPT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import { DurationMs } from "@trading-model/primitives/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import {
	closeMessageManager,
	startDeadLetterForwarding,
	startDelivery,
} from "../config/message-manager";
import { initializeTelemetry, shutdownTelemetry } from "../config/telemetry";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const NULL_ADDRESS_MANAGER = {
	stop() {
		// Intentional no-op.
	},
	async leave() {
		// Intentional no-op.
	},
};

let addressManager: Pick<
	ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>,
	"stop" | "leave"
> = NULL_ADDRESS_MANAGER;

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

createBootstrap({
	name: "Message Manager",
	createServer,
	onStart: () => {
		initializeTelemetry();
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		startDeadLetterForwarding();
		startDelivery();
	},
	shutdown: {
		// Publishers keep a resolved address for CACHE_TTL_MS: leave discovery,
		// then keep serving until no publisher can still pick this instance.
		beforeClose: async () => {
			await addressManager.leave();
			await sleep(ENV.CACHE_TTL_MS);
		},
		// A publish only lasts until the message is journaled (ADR-0048); the
		// deliveries in flight are awaited by closeMessageManager.
		closeTimeoutMs: DurationMs.of(PUBLISH_ACCEPT_TIMEOUT_MS),
	},
	onStop: async () => {
		await closeMessageManager();
		addressManager.stop();
		await shutdownTelemetry();
	},
});
