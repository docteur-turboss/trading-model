import { setLogger } from "@trading-model/contracts/logger-registry";
import {
	type JsonObject,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import promClient from "prom-client";
import { formatLogEntry } from "./console-formatter";
import { isLogLevelAtLeast, LogLevel } from "./log-types";
import { getNodeEnv, NODE_ENV } from "./shared/node-env";

export { LogLevel };

const LOG_MESSAGES_TOTAL = new promClient.Counter({
	name: "log_messages_total",
	help: "Log lines written, by level",
	labelNames: ["level"] as const,
});

/** Writes structured log entries at or above the configured level. */
export class Logger {
	private _logLevel: LogLevel;

	constructor(logLevel: LogLevel = LogLevel.Info) {
		this._logLevel = logLevel;
	}

	private _log(level: LogLevel, message: string, context?: JsonObject): void {
		if (!isLogLevelAtLeast(level, this._logLevel)) {
			return;
		}
		// Counted after the level filter: the metric matches the lines really written.
		LOG_MESSAGES_TOTAL.inc({ level });
		console[level](
			formatLogEntry({
				label: level.toUpperCase(),
				timestamp: UnixTimestamp.now(),
				message,
				context,
			})
		);
	}

	debug(message: string, context?: JsonObject) {
		this._log(LogLevel.Debug, message, context);
	}

	info(message: string, context?: JsonObject) {
		this._log(LogLevel.Info, message, context);
	}

	warn(message: string, context?: JsonObject) {
		this._log(LogLevel.Warn, message, context);
	}

	error(message: string, context?: JsonObject) {
		this._log(LogLevel.Error, message, context);
	}
}

/**
 * Creates a logger whose level comes from `LOG_LEVEL` (a `LogLevel` value,
 * case-insensitive). Without `LOG_LEVEL`, the level follows `NODE_ENV`:
 * development → debug, staging → info, anything else → warn. An invalid
 * `LOG_LEVEL` falls back to that default and logs a WARN (never throws: the
 * global logger is created at import time, before the environment is validated).
 */
export function createLogger(): Logger {
	const nodeEnv = getNodeEnv();
	const defaultLevel =
		nodeEnv === NODE_ENV.DEVELOPMENT
			? LogLevel.Debug
			: nodeEnv === NODE_ENV.STAGING
				? LogLevel.Info
				: LogLevel.Warn;
	const raw = process.env.LOG_LEVEL;
	if (!raw) {
		return new Logger(defaultLevel);
	}
	const requested = raw.toLowerCase() as LogLevel;
	if (Object.values(LogLevel).includes(requested)) {
		return new Logger(requested);
	}
	const created = new Logger(defaultLevel);
	// defaultLevel is at most warn, so this line is always written.
	created.warn("Invalid LOG_LEVEL, using the NODE_ENV default", {
		logLevel: raw,
		allowed: Object.values(LogLevel),
		fallback: defaultLevel,
	});
	return created;
}

/** Global logger instance; level from `LOG_LEVEL`, else from `NODE_ENV` (see {@link createLogger}). */
export const logger: Logger = createLogger();

setLogger(logger);
