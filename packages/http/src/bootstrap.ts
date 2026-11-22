import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { gracefulShutdown, hardShutdown } from "./bootstrap-shutdown";
import type { BootstrapOptions } from "./bootstrap-types";
import type { HttpServer } from "./shared/server-types";
import { setupProcessHandlers } from "./signal-handler";

export type {
	BootstrapOptions,
	GracefulShutdownOptions,
} from "./bootstrap-types";

export function createBootstrap(options: BootstrapOptions): {
	shutdown: (signal: string) => Promise<void>;
} {
	const svrRef: { current: HttpServer | null } = { current: null };
	const doHardShutdown = (code: number) =>
		hardShutdown(code, svrRef.current, options);
	const doShutdown = (signal: string) =>
		gracefulShutdown(signal, svrRef.current, options);
	setupProcessHandlers(doShutdown, doHardShutdown);
	void runBootstrap(
		options,
		(svr) => {
			svrRef.current = svr;
		},
		doHardShutdown
	);
	return { shutdown: doShutdown };
}

async function runBootstrap(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	onFatal: (code: number) => void
): Promise<void> {
	getLogger().info("Bootstrapping service", {
		context: { name: options.name },
	});
	try {
		await options.onBeforeServer?.();
		setServer(await options.createServer());
		await options.onStart?.();
		getLogger().info("Service started successfully", {
			context: { name: options.name },
		});
	} catch (err) {
		getLogger().error("Fatal error during service bootstrap", {
			context: { err: normalizeError(err) },
		});
		onFatal(1);
	}
}
