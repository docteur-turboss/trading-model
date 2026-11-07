import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { HttpServer } from "../../adapters/inbound/create-secure-server";
import { setupProcessHandlers } from "../../infrastructure/signal-handler";
import { gracefulShutdown, hardShutdown } from "./bootstrap-shutdown";
import type { BootstrapOptions } from "./bootstrap-types";

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
	runBootstrap(
		options,
		(svr) => {
			svrRef.current = svr;
		},
		doHardShutdown
	);
	return { shutdown: doShutdown };
}

function _onBootstrapError(
	onFatal: (code: number) => void,
	err: unknown
): void {
	logger.error("Fatal error during service bootstrap", {
		context: { err: normalizeError(err) },
	});
	onFatal(1);
}

function runBootstrap(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	onFatal: (code: number) => void
): void {
	const onError = (err: unknown) => _onBootstrapError(onFatal, err);
	logger.info("Bootstrapping service", { context: { name: options.name } });
	runSyncOrAsync(
		() => options.onBeforeServer?.(),
		() => _finishCreateServer(options, setServer, onError),
		onError
	);
}

function _finishCreateServer(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	onError: (err: unknown) => void
): void {
	runSyncOrAsync(
		() => options.createServer(),
		(httpServer) => {
			setServer(httpServer);
			finishBootstrap(options);
		},
		onError
	);
}

function runSyncOrAsync<TValue>(
	fn: () => TValue | Promise<TValue> | undefined,
	onSuccess: (value: TValue) => void,
	onError: (err: unknown) => void
): void {
	try {
		const result = fn();
		if (result instanceof Promise) {
			result.then(onSuccess).catch(onError);
			return;
		}
		(onSuccess as (value: unknown) => void)(result);
	} catch (err) {
		onError(err);
	}
}

function finishBootstrap(options: BootstrapOptions): void {
	options.onStart?.();
	logger.info("Service started successfully", {
		context: { name: options.name },
	});
}
