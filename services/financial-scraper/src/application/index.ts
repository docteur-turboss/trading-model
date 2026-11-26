import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { Leadership } from "@trading-model/reliability/leadership";
import { createCollector } from "../config/container";
import { closeDatabase } from "../config/db";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

let collector: Leadership | null = null;

createBootstrap({
	name: "Financial Scraper",
	createServer,
	onStart: async () => {
		collector = await createCollector(ENV);
		collector?.start();
	},
	// Collector grace 60 s (HTTP replicas 30 s, defaults fit): preStop 10 s, 5 s forced exit.
	shutdown: ENV.SCRAPE_SCHEDULER_ENABLED
		? {
				onStopTimeoutMs: DurationMs.of(30_000),
				deadlineMs: DurationMs.of(40_000),
			}
		: undefined,
	onStop: async () => {
		// Before leaving discovery: the cycle in flight still needs the database.
		// Then the lease goes to the successor (ADR-0057).
		await collector?.stop();
		await shutdownTelemetry();
		// Last: the cycle used it.
		await closeDatabase();
	},
});
