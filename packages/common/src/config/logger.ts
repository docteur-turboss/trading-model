import type { TlsPaths } from "../domain/tls-paths";
import { type LogEntry, LogLevel, type LogOptions, isLogLevelAtLeast } from "./log-types";

export type { LogEntry, LogOptions };
export { LogLevel };

import { LogBuffer } from "./log-buffer";
import { LogDispatcher } from "./log-dispatcher";
import { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

export class Logger {
	private _logLevel: LogLevel;
	private _userId = '';
	private readonly _sessionId: string;
	private readonly _buffer: LogBuffer;
	private readonly _dispatcher: LogDispatcher;

	constructor(logLevel: LogLevel = "info") {
		this._logLevel = logLevel;
		this._sessionId = this._generateSessionId();
		this._buffer = new LogBuffer();
		this._dispatcher = new LogDispatcher(new SensitiveDataSanitizer(), this._sessionId);
	}

	private _generateSessionId(): string {
		const now = new Date();
		return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${this._logLevel}_${(crypto.getRandomValues(new Uint32Array(10))[0] * 2 ** -32).toString(36).substring(2, 10)}`;
	}

	private _shouldLog(level: LogLevel): boolean {
		return isLogLevelAtLeast(level, this._logLevel);
	}

	debug(message: string, context?: Record<string, unknown>) {
		if (!this._shouldLog(LogLevel.Debug)) {
			return;
		}

		const logEntry = this._dispatcher.createLogEntry(LogLevel.Debug, message, this._userId, { context });
		this._buffer.add(logEntry);
		console.debug(
			`[DEBUG] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	info(message: string, context?: Record<string, unknown>) {
		if (!this._shouldLog(LogLevel.Info)) {
			return;
		}

		const logEntry = this._dispatcher.createLogEntry(LogLevel.Info, message, this._userId, { context });
		this._buffer.add(logEntry);
		console.info(
			`[INFO] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	warn(message: string, context?: Record<string, unknown>) {
		if (!this._shouldLog(LogLevel.Warn)) {
			return;
		}

		const logEntry = this._dispatcher.createLogEntry(LogLevel.Warn, message, this._userId, { context });
		this._buffer.add(logEntry);
		console.warn(
			`[WARN] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	error(message: string, context?: Record<string, unknown>) {
		if (!this._shouldLog(LogLevel.Error)) {
			return;
		}

		const logEntry = this._dispatcher.createLogEntry(LogLevel.Error, message, this._userId, { context });
		this._buffer.add(logEntry);
		console.error(
			`[ERROR] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);

		this._dispatcher.sendError(logEntry);
	}

	setUserId(userId: string) {
		this._userId = userId;
	}

	getLogs() {
		return this._buffer.getAll();
	}

	setAuditResolver(
		resolver: () => Promise<{
			url: string;
			tls: TlsPaths;
		} | null>
	): void {
		this._dispatcher.setAuditResolver(resolver);
	}
}

/** Global logger instance pre-configured based on the current environment. */
export const logger = new Logger(
	process.env.NODE_ENV === "development"
		? "debug"
		: process.env.NODE_ENV === "staging"
			? "info"
			: "warn"
);

export const LOGGER = Logger;
