import { normalizeError } from "@trading-model/common/utils/errors";
import { withTimeout } from "@trading-model/common/utils/retry";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { BootstrapOptions } from "./bootstrap-types";
import type { HttpServer } from "./shared/server-types";

/** Runs `fn` now (a sync throw included) and logs its failure as a warning, never rethrows. */
function _warnOnFailure(
	fn: (() => unknown) | undefined,
	message: string
): Promise<void> {
	// The executor runs synchronously: `fn` starts before this returns.
	return new Promise((resolve) => resolve(fn?.())).then(
		() => undefined,
		(err) =>
			getLogger().warn(message, { context: { err: normalizeError(err) } })
	);
}

/** Options whose onStop already started: it runs once, whichever path shuts down. */
const onStopStarted = new WeakSet<BootstrapOptions>();

function _onStopOnce(options: BootstrapOptions): (() => unknown) | undefined {
	const onStop = options.onStop;
	if (!onStop || onStopStarted.has(options)) {
		return undefined;
	}
	onStopStarted.add(options);
	return onStop;
}

const DEFAULT_CLOSE_TIMEOUT_MS = DurationMs.of(5000);
/** Server close (5 s) + onStop (3 s) stay below the shortest grace, 10 s (edge-proxy). */
const ON_STOP_TIMEOUT_MS = DurationMs.of(3000);

/** Grace left to onStop and the server close; below the shortest terminationGracePeriodSeconds (10 s, edge-proxy). */
const HARD_EXIT_DELAY_MS = 5000;

export function hardShutdown(
	code: number,
	server: HttpServer | null,
	options: BootstrapOptions
): void {
	void _warnOnFailure(
		server ? () => server.close() : undefined,
		"Server close during forced shutdown failed"
	);
	void _warnOnFailure(
		_onStopOnce(options),
		"onStop callback failed during forced shutdown"
	);
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
		await _warnOnFailure(
			options.shutdown?.beforeClose,
			"beforeClose callback failed during graceful shutdown"
		);
		if (server) {
			await withTimeout(
				server.close(),
				options.shutdown?.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS,
				"Server close timed out"
			);
			getLogger().info("HTTP server closed");
		}
		const onStop = _onStopOnce(options);
		await _warnOnFailure(
			onStop &&
				(() =>
					withTimeout(
						Promise.resolve().then(onStop),
						ON_STOP_TIMEOUT_MS,
						"onStop timed out"
					)),
			"onStop callback failed during graceful shutdown"
		);
		getLogger().info("Shutdown completed gracefully");
		process.exit(0);
	} catch (error) {
		getLogger().error("Error during graceful shutdown", {
			context: { err: normalizeError(error) },
		});
		hardShutdown(1, server, options);
	}
}
