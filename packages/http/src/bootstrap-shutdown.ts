import { normalizeError } from "@trading-model/common/utils/errors";
import { withTimeout } from "@trading-model/common/utils/retry";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { BootstrapOptions } from "./bootstrap-types";
import type { HttpServer } from "./create-secure-server";

function _closeServerOnShutdown(server: HttpServer | null): void {
	if (!server) {
		return;
	}
	server.close().catch((err) =>
		getLogger().warn("Server close during forced shutdown failed", {
			context: { err: normalizeError(err) },
		})
	);
}

/** Options whose onStop already started: it runs once, whichever path shuts down. */
const onStopStarted = new WeakSet<BootstrapOptions>();

function _runOnStop(options: BootstrapOptions): void {
	if (!options.onStop || onStopStarted.has(options)) {
		return;
	}
	onStopStarted.add(options);
	try {
		Promise.resolve(options.onStop()).catch((err) =>
			getLogger().warn("onStop callback failed during forced shutdown", {
				context: { err: normalizeError(err) },
			})
		);
	} catch (err) {
		getLogger().warn("onStop callback failed during forced shutdown", {
			context: { err: normalizeError(err) },
		});
	}
}

const DEFAULT_CLOSE_TIMEOUT_MS = DurationMs.of(5000);
/** Server close (5 s) + onStop (3 s) stay below the shortest grace, 10 s (edge-proxy). */
const ON_STOP_TIMEOUT_MS = DurationMs.of(3000);

async function _runBeforeClose(options: BootstrapOptions): Promise<void> {
	const beforeClose = options.shutdown?.beforeClose;
	if (!beforeClose) {
		return;
	}
	try {
		await beforeClose();
	} catch (err) {
		getLogger().warn("beforeClose callback failed during graceful shutdown", {
			context: { err: normalizeError(err) },
		});
	}
}

async function _awaitOnStop(options: BootstrapOptions): Promise<void> {
	if (!options.onStop || onStopStarted.has(options)) {
		return;
	}
	onStopStarted.add(options);
	try {
		await withTimeout(
			Promise.resolve().then(options.onStop),
			ON_STOP_TIMEOUT_MS,
			"onStop timed out"
		);
	} catch (err) {
		getLogger().warn("onStop callback failed during graceful shutdown", {
			context: { err: normalizeError(err) },
		});
	}
}

/** Grace left to onStop and the server close; below the shortest terminationGracePeriodSeconds (10 s, edge-proxy). */
const HARD_EXIT_DELAY_MS = 5000;

export function hardShutdown(
	code: number,
	server: HttpServer | null,
	options: BootstrapOptions
): void {
	_closeServerOnShutdown(server);
	_runOnStop(options);
	getLogger().warn("Forced shutdown", { context: { exitCode: code } });
	process.exitCode = code;
	setTimeout(() => process.exit(code), HARD_EXIT_DELAY_MS).unref();
}

export async function gracefulShutdown(
	signal: string,
	server: HttpServer | null,
	options: BootstrapOptions
): Promise<void> {
	getLogger().warn("Shutdown signal received", { context: { signal } });
	try {
		await _runBeforeClose(options);
		if (server) {
			await withTimeout(
				server.close(),
				options.shutdown?.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS,
				"Server close timed out"
			);
			getLogger().info("HTTP server closed");
		}
		await _awaitOnStop(options);
		getLogger().info("Shutdown completed gracefully");
		process.exit(0);
	} catch (error) {
		getLogger().error("Error during graceful shutdown", {
			context: { err: normalizeError(error) },
		});
		hardShutdown(1, server, options);
	}
}
