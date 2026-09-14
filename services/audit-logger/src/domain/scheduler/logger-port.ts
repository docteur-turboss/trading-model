import type { JsonObject } from "@trading-model/common/domain/primitives";

/**
 * Minimal logging contract used by the scheduler domain layer.
 *
 * Keeps domain logic free of infrastructure imports: the concrete logger is
 * injected from the composition root (see job-scheduler-factory.ts).
 */
export interface LoggerPort {
	debug(message: string, context?: JsonObject): void;
	info(message: string, context?: JsonObject): void;
	warn(message: string, context?: JsonObject): void;
	error(message: string, context?: JsonObject): void;
}
