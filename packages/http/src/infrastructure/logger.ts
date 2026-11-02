/**
 * Transitional re-export shim (ADR-0010): the logger pipeline moved to
 * `application/services/logger`. This sub-path is preserved for backward
 * compatibility with existing consumers.
 */
export {
	createLogger,
	type LogEntry,
	Logger,
	LogLevel,
	type LogOptions,
	logger,
} from "../application/services/logger";
