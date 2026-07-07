import type { TlsPaths } from "../domain/tls-paths";
import type { SessionId, UserId } from "../domain/primitives";
import {
	isLogLevelAtLeast,
	type LogEntry,
	LogLevel,
	type LogOptions,
} from "./log-types";

export type { LogEntry, LogOptions };
export { LogLevel };

import { LogBuffer } from "./log-buffer";
import { LogDispatcher } from "./log-dispatcher";
import { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

export class Logger {
	private _logLevel: LogLevel;
	private _userId: UserId = "" as UserId;
	private readonly _sessionId: SessionId;
	private readonly _buffer: LogBuffer;
	private readonly _dispatcher: LogDispatcher;

	constructor(logLevel: LogLevel = "info") {
		this._logLevel = logLevel;
		this._sessionId = this._generateSessionId();
		this._buffer = new LogBuffer();
		this._dispatcher = new LogDispatcher(
			new SensitiveDataSanitizer(),
			this._sessionId
		);
	}

	private _generateSessionId(): SessionId {
		const now = new Date();
		return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${this._logLevel}_${(crypto.getRandomValues(new Uint32Array(10))[0] * 2 ** -32).toString(36).substring(2, 10)}` as SessionId;
	}

	private _log(
		level: LogLevel,
		label: string,
		consoleFn: (message?: unknown, ...optionalParams: unknown[]) => void,
		message: string,
		context?: Record<string, unknown>,
	): void {
		if (!isLogLevelAtLeast(level, this._logLevel)) {
			return;
		}

		const logEntry = this._dispatcher.createLogEntry(
			level,
			message,
			this._userId,
			{ context },
		);
		this._buffer.add(logEntry);
		consoleFn(
			`[${label}] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || "",
		);

		if (level === LogLevel.Error) {
			this._dispatcher.sendError(logEntry);
		}
	}

	debug(message: string, context?: Record<string, unknown>) {
		this._log(LogLevel.Debug, "DEBUG", console.debug, message, context);
	}

	info(message: string, context?: Record<string, unknown>) {
		this._log(LogLevel.Info, "INFO", console.info, message, context);
	}

	warn(message: string, context?: Record<string, unknown>) {
		this._log(LogLevel.Warn, "WARN", console.warn, message, context);
	}

	error(message: string, context?: Record<string, unknown>) {
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
			url: string;
			tls: TlsPaths;
		} | null>
	): void {
		this._dispatcher.setAuditResolver(resolver);
	}
}

/** Global logger instance pre-configured based on the current environment. */
const NODE_ENV = getNodeEnv();
export const logger = new Logger(
	NODE_ENV === "development"
		? "debug"
		: NODE_ENV === "staging"
			? "info"
			: "warn"
);

export function getNodeEnv(): string {
	return process.env.NODE_ENV ?? "development";
}

export const LOGGER = Logger;
