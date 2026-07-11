import {
	type JsonObject,
	type SessionId,
	type URLString,
	UserId,
} from "../domain/primitives";
import type { TlsPaths } from "../domain/tls-paths";
import {
	type LogEntry,
	LogLevel,
	LogLevelThreshold,
	type LogOptions,
} from "./log-types";

export type { LogEntry, LogOptions };
export { LogLevel };

import { formatLogEntry } from "./console-formatter";
import { LogBuffer } from "./log-buffer";
import { LogDispatcher } from "./log-dispatcher";
import { getNodeEnv, NODE_ENV as NODE_ENV_CONST } from "./node-env";
import { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";
import { generateSessionId } from "./session-id-generator";

export class Logger {
	private _logLevel: LogLevel;
	private _userId: UserId = UserId.of("unknown");
	private readonly _sessionId: SessionId;
	private readonly _buffer: LogBuffer;
	private readonly _dispatcher: LogDispatcher;

	constructor(logLevel: LogLevel = LogLevel.Info) {
		this._logLevel = logLevel;
		this._sessionId = generateSessionId(logLevel);
		this._buffer = new LogBuffer();
		this._dispatcher = new LogDispatcher(
			new SensitiveDataSanitizer(),
			this._sessionId
		);
	}

	private _log(
		level: LogLevel,
		label: string,
		consoleFn: (message?: unknown, ...optionalParams: unknown[]) => void,
		message: string,
		context?: JsonObject
	): void {
		if (!LogLevelThreshold.isAtLeast(level, this._logLevel)) {
			return;
		}
		const logEntry = this._buildLogEntry(level, message, context);
		this._emitLog(logEntry, label, consoleFn, context);
		if (level === LogLevel.Error) {
			this._dispatcher.sendError(logEntry);
		}
	}

	private _buildLogEntry(
		level: LogLevel,
		message: string,
		context?: JsonObject
	): import("./log-types").LogEntry {
		return this._dispatcher.createLogEntry(level, message, this._userId, {
			context,
		});
	}

	private _emitLog(
		logEntry: import("./log-types").LogEntry,
		label: string,
		consoleFn: (message?: unknown, ...optionalParams: unknown[]) => void,
		context?: JsonObject
	): void {
		this._buffer.add(logEntry);
		consoleFn(
			formatLogEntry({
				label,
				timestamp: logEntry.timestamp,
				message: logEntry.message,
			}),
			context || ""
		);
	}

	debug(message: string, context?: JsonObject) {
		this._log(LogLevel.Debug, "DEBUG", console.debug, message, context);
	}

	info(message: string, context?: JsonObject) {
		this._log(LogLevel.Info, "INFO", console.info, message, context);
	}

	warn(message: string, context?: JsonObject) {
		this._log(LogLevel.Warn, "WARN", console.warn, message, context);
	}

	error(message: string, context?: JsonObject) {
		this._log(LogLevel.Error, "ERROR", console.error, message, context);
	}

	setUserId(userId: UserId) {
		this._userId = userId;
	}

	getLogs() {
		return this._buffer.getAll();
	}

	setAuditResolver(
		resolver: () => Promise<{
			url: URLString;
			tls: TlsPaths;
		} | null>
	): void {
		this._dispatcher.setAuditResolver(resolver);
	}
}

/** Global logger instance pre-configured based on the current environment. */
const NODE_ENV = getNodeEnv();
export const logger = new Logger(
	NODE_ENV === NODE_ENV_CONST.DEVELOPMENT
		? LogLevel.Debug
		: NODE_ENV === NODE_ENV_CONST.STAGING
			? LogLevel.Info
			: LogLevel.Warn
);

export const LOGGER = Logger;
