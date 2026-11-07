import type { DurationMs } from "@trading-model/primitives/primitives";
import type { HttpServer } from "../../shared/server-types";

export interface BootstrapOptions {
	name: string;
	createServer: () => HttpServer | Promise<HttpServer>;
	onBeforeServer?: () => void | Promise<void>;
	onStart?: () => void;
	onStop?: () => void | Promise<void>;
	shutdown?: GracefulShutdownOptions;
}

/** Graceful shutdown (SIGTERM, SIGINT). */
export interface GracefulShutdownOptions {
	/**
	 * Runs first, while the server still accepts requests: e.g. leave the
	 * service registry and wait until callers stop being routed here. A
	 * failure is logged and the shutdown goes on.
	 */
	beforeClose?: () => Promise<void>;
	/** How long in-flight requests may take to finish (default 10 s). */
	closeTimeoutMs?: DurationMs;
}
