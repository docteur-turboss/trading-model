import type { JsonObject } from "../domain/primitives";

/**
 * Minimal logging contract used across `@trading-model/common`.
 *
 * `common` is the base layer and must not depend on `@trading-model/http`.
 * The concrete logger lives in `@trading-model/http` and is registered into
 * this module at import time (see `packages/http/src/infrastructure/logger.ts`),
 * so all consumers keep the same singleton without a package-level cycle.
 */
export interface LoggerPort {
	debug(message: string, context?: JsonObject): void;
	info(message: string, context?: JsonObject): void;
	warn(message: string, context?: JsonObject): void;
	error(message: string, context?: JsonObject): void;
}

/** No-op logger used before the concrete logger is registered. */
const NoopLogger: LoggerPort = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

let _logger: LoggerPort = NoopLogger;

/** Registers the concrete logger (called by `@trading-model/http`). */
export function setLogger(logger: LoggerPort): void {
	_logger = logger;
}

/** Returns the registered logger (or a no-op before registration). */
export function getLogger(): LoggerPort {
	return _logger;
}
