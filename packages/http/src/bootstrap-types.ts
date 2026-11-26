import type { DurationMs } from "@trading-model/primitives/primitives";
import type { HttpServer } from "./shared/server-types";

export interface BootstrapOptions {
	name: string;
	createServer: () => HttpServer | Promise<HttpServer>;
	onBeforeServer?: () => void | Promise<void>;
	onStart?: () => void | Promise<void>;
	onStop?: () => void | Promise<void>;
	shutdown?: GracefulShutdownOptions;
}

/** Graceful shutdown (SIGTERM, SIGINT). */
export interface GracefulShutdownOptions {
	/** How long in-flight requests may take to finish (default 5 s). */
	closeTimeoutMs?: DurationMs;
	/** How long `onStop` may take; past it the shutdown exits 1 (default 3 s). */
	onStopTimeoutMs?: DurationMs;
	/**
	 * Whole shutdown (close + onStop): past it, forced exit 1
	 * (default 8 s). Keep it, plus the 5 s forced-exit delay, under the grace.
	 */
	deadlineMs?: DurationMs;
}
