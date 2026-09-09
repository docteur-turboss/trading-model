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

import { CircularBuffer } from "../utils/circular-buffer";
import { formatLogEntry } from "./console-formatter";
import { createLogger } from "./create-logger";
import { LogDispatcher } from "./log-dispatcher";
import { safeStringify } from "./sensitive-data-sanitizer";
import { generateSessionId } from "./session-id-generator";

export class Logger {
	private _logLevel: LogLevel;
	private _userId: UserId = UserId.of("unknown");
	private readonly _sessionId: SessionId;
	private readonly _buffer: CircularBuffer<LogEntry>;
	private readonly _dispatcher: LogDispatcher;

	constructor(
		logLevel: LogLevel = LogLevel.Info,
		sessionId?: SessionId,
		buffer?: CircularBuffer<LogEntry>,
		dispatcher?: LogDispatcher
	) {
		this._logLevel = logLevel;
		this._sessionId = sessionId ?? generateSessionId(logLevel);
		this._buffer = buffer ?? new CircularBuffer<LogEntry>(1000);
		this._dispatcher =
			dispatcher ?? new LogDispatcher(safeStringify, this._sessionId);
	}

	private _log(level: LogLevel, message: string, context?: JsonObject): void {
		if (!LogLevelThreshold.isAtLeast(level, this._logLevel)) {
			return;
		}
		const logEntry = this._buildLogEntry(level, message, context);
		const { label, consoleFn } = this._consoleTarget(level);
		this._emitLog(logEntry, label, consoleFn, context);
		if (level === LogLevel.Error) {
			this._dispatcher.sendError(logEntry);
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
export const logger: Logger = createLogger();

export const LOGGER = Logger;
