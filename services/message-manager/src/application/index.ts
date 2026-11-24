import "./telemetry";
import { sleep } from "@trading-model/common/utils/sleep";
import { PUBLISH_ACCEPT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { DurationMs } from "@trading-model/primitives/primitives";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { closeMessageManager, startDelivery } from "../config/message-manager";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | undefined;

createBootstrap({
	name: "Message Manager",
	createServer,
	onStart: () => {
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		startDelivery();
	},
	shutdown: {
		// Publishers keep a resolved address for CACHE_TTL_MS: leave discovery,
		// then keep serving until no publisher can still pick this instance.
		beforeClose: async () => {
			await addressManager?.leave();
			await sleep(ENV.CACHE_TTL_MS);
		},
		// A publish only lasts until the message is journaled (ADR-0048); the
		// deliveries in flight are awaited by closeMessageManager.
		closeTimeoutMs: DurationMs.of(PUBLISH_ACCEPT_TIMEOUT_MS),
		// Grace 120 s: beforeClose 30 s + close 15 s + onStop 45 s, 100 s + 5 s forced exit.
		onStopTimeoutMs: DurationMs.of(45_000),
		deadlineMs: DurationMs.of(100_000),
	},
	onStop: async () => {
		await closeMessageManager();
		await addressManager?.stop();
		await shutdownTelemetry();
	},
});
