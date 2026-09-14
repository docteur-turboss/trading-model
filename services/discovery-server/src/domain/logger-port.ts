import type { JsonObject } from "@trading-model/common/domain/primitives";

/**
 * Minimal logging contract used by the discovery domain layer.
 *
 * Keeps domain logic free of infrastructure imports: the concrete logger is
 * injected from the composition root (application/index.ts and
 * infrastructure/redis-health-monitor.ts).
 */
export interface LoggerPort {
	debug(message: string, context?: JsonObject): void;
	info(message: string, context?: JsonObject): void;
	warn(message: string, context?: JsonObject): void;
	error(message: string, context?: JsonObject): void;
}

/** No-op logger used as default when the composition root provides none. */
export const NoopLogger: LoggerPort = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};
