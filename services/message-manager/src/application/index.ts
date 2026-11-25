import "./telemetry";
import { PUBLISH_ACCEPT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { DurationMs } from "@trading-model/primitives/primitives";
import { closeMessageManager, startDelivery } from "../config/message-manager";
import { createServer } from "./server";

createBootstrap({
	name: "Message Manager",
	createServer,
	onStart: () => {
		startDelivery();
	},
	shutdown: {
		// A publish only lasts until the message is journaled (ADR-0048); the
		// deliveries in flight are awaited by closeMessageManager.
		closeTimeoutMs: DurationMs.of(PUBLISH_ACCEPT_TIMEOUT_MS),
		// Grace 120 s: close 15 s + onStop 45 s, deadline 100 s + 5 s forced exit.
		onStopTimeoutMs: DurationMs.of(45_000),
		deadlineMs: DurationMs.of(100_000),
	},
	onStop: async () => {
		await closeMessageManager();
		await shutdownTelemetry();
	},
});
