import { setLogger } from "@trading-model/contracts/logger-registry";
import {
	type JsonObject,
	type ProcessId,
	UnixTimestamp,
	UserId,
} from "@trading-model/primitives/primitives";
import { formatLogEntry } from "../../infrastructure/console-formatter";
import { sendError } from "../../infrastructure/log-dispatcher";
import {
	isLogLevelAtLeast,
	type LogEntry,
	LogLevel,
	type LogOptions,
} from "../../infrastructure/log-types";
import { generateProcessId } from "../../infrastructure/process-id-generator";
import { safeStringify } from "../../infrastructure/sensitive-data-sanitizer";
import { getNodeEnv, NODE_ENV } from "../../shared/node-env";

export type { LogEntry, LogOptions };
export { LogLevel };

const UNKNOWN_USER = UserId.of("unknown");

/** Writes structured log entries at or above the configured level. */
export class Logger {
	private _logLevel: LogLevel;
	private readonly _processId: ProcessId;
	private readonly _env: string | undefined;

	constructor(logLevel: LogLevel = LogLevel.Info, processId?: ProcessId) {
		this._logLevel = logLevel;
		this._processId = processId ?? generateProcessId(logLevel);
		this._env = getNodeEnv();
	}

	private _log(level: LogLevel, message: string, context?: JsonObject): void {
		if (!isLogLevelAtLeast(level, this._logLevel)) {
			return;
		}
		const logEntry = this._buildLogEntry(level, message, context);
		const { label, consoleFn } = this._consoleTarget(level);
		this._emitLog(logEntry, label, consoleFn, context);
		if (level === LogLevel.Error) {
			void sendError(safeStringify, logEntry, this._env);
		}
	}

	private _consoleTarget(level: LogLevel): {
		label: string;
		consoleFn: (message?: unknown, ...optionalParams: unknown[]) => void;
	} {
		switch (level) {
			case LogLevel.Debug:
				return { label: "DEBUG", consoleFn: console.debug };
			case LogLevel.Warn:
				return { label: "WARN", consoleFn: console.warn };
			case LogLevel.Error:
				return { label: "ERROR", consoleFn: console.error };
			default:
				return { label: "INFO", consoleFn: console.info };
		}
	}

	private _buildLogEntry(
		level: LogLevel,
		message: string,
		context?: JsonObject
	): LogEntry {
		return {
			timestamp: UnixTimestamp.now(),
			level,
			message,
			context,
			processId: this._processId || undefined,
			userId: UNKNOWN_USER,
		};
	}

	private _emitLog(
		logEntry: LogEntry,
		label: string,
		consoleFn: (message?: unknown, ...optionalParams: unknown[]) => void,
		context?: JsonObject
	): void {
		consoleFn(
			formatLogEntry({
				label,
				timestamp: logEntry.timestamp,
				message: logEntry.message,
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
