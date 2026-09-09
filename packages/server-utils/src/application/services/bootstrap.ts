import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { HttpServer } from "../../adapters/inbound/create-secure-server";
import { setupProcessHandlers } from "../../infrastructure/signal-handler";
import type { BootstrapOptions } from "../../shared/bootstrap-types";
import { gracefulShutdown, hardShutdown } from "./bootstrap-shutdown";

export type {
	BootstrapOptions,
	TlsBootstrapOptions,
} from "../../shared/bootstrap-types";

export function createBootstrap(options: BootstrapOptions): {
	shutdown: (signal: string) => Promise<void>;
} {
	const svrRef: { current: HttpServer | null } = { current: null };
	const doHardShutdown = (code: number) =>
		hardShutdown(code, svrRef.current, options);
	const doShutdown = (signal: string) =>
		gracefulShutdown(signal, svrRef.current, options);
	setupProcessHandlers(doShutdown, doHardShutdown);
	_startBootstrap(
		options,
		(svr) => {
			svrRef.current = svr;
		},
		doHardShutdown
	);
	return { shutdown: doShutdown };
}

function _startBootstrap(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	doHardShutdown: (code: number) => void
): void {
	runBootstrap(options, setServer, doHardShutdown);
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
		() => options.tlsBootstrap?.ensure(),
		() => _handleBeforeServer(options, setServer, onError),
		onError
	);
}

function _handleBeforeServer(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	onError: (err: unknown) => void
): void {
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
			setupAutoRenew(httpServer, options);
			finishBootstrap(httpServer, options);
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

function setupAutoRenew(
	httpServer: HttpServer,
	options: BootstrapOptions
): void {
	if (options.tlsBootstrap?.setupAutoRenew) {
		options.tlsBootstrap.setupAutoRenew(httpServer.raw);
	}
}

function finishBootstrap(
	_httpServer: HttpServer,
	options: BootstrapOptions
): void {
	if (options.onStart) {
		options.onStart();
	}
	logger.info("Service started successfully", {
		context: { name: options.name },
	});
}

export { gracefulShutdown, hardShutdown } from "./bootstrap-shutdown";
