import { appendFile } from "node:fs";
import { mkdir } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import path from "node:path";

import { normalizeError } from "../utils/errors";

/**
 * LogLevel enumeration defines the severity levels for logging.
 * DEBUG   - Detailed debugging information
 * INFO    - Informational messages
 * WARN    - Warnings that may need attention
 * ERROR   - Critical errors that require immediate attention
 */
export enum LogLevel {
	Debug = 0,
	Info = 1,
	Warn = 2,
	Error = 3,
}

/**
 * Represents a single log entry.
 */
export interface LogEntry {
	timestamp: Date; // Timestamp when the log was created
	level: LogLevel; // Severity level of the log
	message: string; // Log message
	context?: Record<string, unknown>; // Optional additional context (e.g., variables, request info)
	userId?: string; // Optional ID of the user related to the log
	sessionId?: string; // Optional session ID
	url?: string; // Optional URL associated with the log
	serviceInCharge?: string; // Optional service or module responsible
}

/** Structured logger with multiple severity levels. */
export class Logger {
	private _logLevel: LogLevel; // Minimum log level to record
	private _logs: LogEntry[] = []; // Internal buffer of log entries
	private _maxLogs = 1000; // Maximum buffer size
	private _sessionId: string | null; // Session identifier
	private _userId: string | null = null; // Optional user identifier
	private _handleErrorServiceUrl: string | null = null;
	private _auditResolver?: () => Promise<{
		url: string;
		tls: { key: string; cert: string; ca: string };
	} | null>;
	private readonly _env: string | undefined;

	/** @param logLevel - Minimum severity level to log (default: LogLevel.Info) */
	constructor(logLevel: LogLevel = LogLevel.Info) {
		this._logLevel = logLevel;
		this._env = process.env.NODE_ENV;
		this._sessionId = this._generateSessionId();
	}

	private _generateSessionId(): string {
		const now = new Date();
		return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${this._logLevel}_${(crypto.getRandomValues(new Uint32Array(10))[0] * 2 ** -32).toString(36).substring(2, 10)}`;
	}

	private _shouldLog(level: LogLevel): boolean {
		return level >= this._logLevel;
	}

	private _safeStringify(value: unknown): string {
		const seen = new WeakSet<object>();
		const sensitiveKeyPatterns = [
			/^password$/i,
			/^token$/i,
			/^secret$/i,
			/^authorization$/i,
			/^cookie$/i,
			/^api[-_]?key$/i,
			/^api[-_]?secret$/i,
			/^mysql_root_password$/i,
			/^db_password$/i,
			/^jwt[-_]?secret$/i,
			/^private[-_]?key$/i,
			/^tls[-_]?(key|cert|ca)$/i,
			/^certificatepath$/i,
			/^keycertificatepath$/i,
			/^rootcacertpath$/i,
			/\.secret$/i,
			/\.token$/i,
		];
		return JSON.stringify(value, (key, val) => {
			if (key && sensitiveKeyPatterns.some((pattern) => pattern.test(key))) {
				return "[REDACTED]";
			}
			if (typeof val === "object" && val !== null) {
				if (seen.has(val)) {
					return "[Circular]";
				}
				seen.add(val);
			}
			return val;
		});
	}

	private _createLogEntry(
		level: LogLevel,
		message: string,
		context?: Record<string, unknown>,
		url = "",
		serviceInCharge = ""
	): LogEntry {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		const day = now.getDate();
		const data = {
			timestamp: now,
			level,
			message,
			context,
			sessionId: this._sessionId || undefined,
			userId: this._userId || undefined,
			url,
			serviceInCharge,
		};

		const logDir = process.env.LOG_DIR;
		if (logDir) {
			const logFilePath = path.resolve(logDir);
			const logFileName = `${year}.${month}.${day}-${level}.log`;

			mkdir(logFilePath, { recursive: true }).catch(() => {});
			appendFile(
				path.resolve(logFilePath, logFileName),
				`${this._safeStringify(data)}\n`,
				(err) => {
					if (err) {
						console.error("[Logger] Failed to write log file:", err);
					}
				}
			);
		}

		if (this._auditResolver && level >= LogLevel.Info) {
			void this._sendToAuditService(data);
		}

		return data;
	}

	/**
	 * Adds a log entry to the internal log buffer.
	 *
	 * Behavior:
	 *  - Appends the new `LogEntry` to the in-memory `logs` array.
	 *  - Ensures the buffer does not exceed `maxLogs` entries by removing
	 *    the oldest log if the limit is surpassed (FIFO behavior).
	 *
	 * This method helps manage memory usage while retaining the most recent logs.
	 *
	 * @param logEntry - The log entry to add to the buffer
	 */
	private _addToBuffer(logEntry: LogEntry) {
		this._logs.push(logEntry);
		if (this._logs.length > this._maxLogs) {
			this._logs.shift();
		}
	}

	/**
	 * Logs a DEBUG-level message with optional context, URL, and service information.
	 *
	 * Behavior:
	 *  - Checks if DEBUG-level logging is enabled; returns early if not.
	 *  - Creates a `LogEntry` containing the message, context, user/session info, URL, and service in charge.
	 *  - Adds the entry to the internal log buffer (FIFO, up to `maxLogs`).
	 *  - Outputs the message to the console via `console.debug`.
	 *
	 * @param message - The main log message providing detailed debugging information.
	 * @param context - Optional additional context (e.g., variables, request data) to include in the log.
	 * @param url - Optional URL associated with the log event.
	 * @param serviceInCharge - Optional identifier for the service or module responsible for the log.
	 */
	debug(
		message: string,
		context?: Record<string, unknown>,
		url?: string,
		serviceInCharge?: string
	) {
		if (!this._shouldLog(LogLevel.Debug)) {
			return;
		}

		const logEntry = this._createLogEntry(
			LogLevel.Debug,
			message,
			context,
			url,
			serviceInCharge
		);
		this._addToBuffer(logEntry);
		console.debug(
			`[DEBUG] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	/**
	 * Logs an INFO-level message with optional context, URL, and service information.
	 *
	 * Behavior:
	 *  - Checks if INFO-level logging is enabled; returns early if not.
	 *  - Creates a `LogEntry` containing the message, context, user/session info, URL, and service in charge.
	 *  - Adds the entry to the internal log buffer (FIFO, up to `maxLogs`).
	 *  - Outputs the message to the console via `console.info`.
	 *
	 * @param message - The main log message providing informational details.
	 * @param context - Optional additional context (e.g., variables, request data) to include in the log.
	 * @param url - Optional URL associated with the log event.
	 * @param serviceInCharge - Optional identifier for the service or module responsible for the log.
	 */
	info(
		message: string,
		context?: Record<string, unknown>,
		url?: string,
		serviceInCharge?: string
	) {
		if (!this._shouldLog(LogLevel.Info)) {
			return;
		}

		const logEntry = this._createLogEntry(
			LogLevel.Info,
			message,
			context,
			url,
			serviceInCharge
		);
		this._addToBuffer(logEntry);
		console.info(
			`[INFO] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	/**
	 * Logs a WARN-level message with optional context, URL, and service information.
	 *
	 * Behavior:
	 *  - Checks if WARN-level logging is enabled; returns early if not.
	 *  - Creates a `LogEntry` containing the message, context, user/session info, URL, and service in charge.
	 *  - Adds the entry to the internal log buffer (FIFO, up to `maxLogs`).
	 *  - Outputs the message to the console via `console.warn`.
	 *
	 * @param message - The main log message describing the warning.
	 * @param context - Optional additional context (e.g., variables, request data) to include in the log.
	 * @param url - Optional URL associated with the log event.
	 * @param serviceInCharge - Optional identifier for the service or module responsible for the log.
	 */
	warn(
		message: string,
		context?: Record<string, unknown>,
		url?: string,
		serviceInCharge?: string
	) {
		if (!this._shouldLog(LogLevel.Warn)) {
			return;
		}

		const logEntry = this._createLogEntry(
			LogLevel.Warn,
			message,
			context,
			url,
			serviceInCharge
		);
		this._addToBuffer(logEntry);
		console.warn(
			`[WARN] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	/**
	 * Logs an ERROR-level message with optional context, URL, and service information.
	 *
	 * Behavior:
	 *  - Checks if ERROR-level logging is enabled; returns early if not.
	 *  - Creates a `LogEntry` containing the message, context, user/session info, URL, and service in charge.
	 *  - Adds the entry to the internal log buffer (FIFO, up to `maxLogs`).
	 *  - Outputs the message to the console via `console.error`.
	 *  - In production or staging environments, forwards the log entry to an external error-handling service
	 *    using `sendToErrorService`.
	 *
	 * @param message - The main log message describing the error.
	 * @param context - Optional additional context (e.g., variables, request data) to include in the log.
	 * @param url - Optional URL associated with the log event.
	 * @param serviceInCharge - Optional identifier for the service or module responsible for the log.
	 */
	error(
		message: string,
		context?: Record<string, unknown>,
		url?: string,
		serviceInCharge?: string
	) {
		if (!this._shouldLog(LogLevel.Error)) {
			return;
		}

		const logEntry = this._createLogEntry(
			LogLevel.Error,
			message,
			context,
			url,
			serviceInCharge
		);
		this._addToBuffer(logEntry);
		console.error(
			`[ERROR] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);

		if (this._env === "production" || this._env === "staging") {
			void this._sendToErrorService(logEntry);
		}
	}

	/**
	 * Assigns a user identifier to be included in all subsequent log entries.
	 *
	 * This is useful for tracking which user triggered specific actions,
	 * providing context in logs for debugging, auditing, or monitoring purposes.
	 *
	 * @param userId - The identifier of the user associated with future logs
	 */
	setUserId(userId: string) {
		this._userId = userId;
	}

	/**
	 * Configures the URL of the external error-handling service.
	 *
	 * This URL will be used by `sendToErrorService` to forward ERROR-level logs
	 * when the logger is running in production or staging environments.
	 * If not set, `sendToErrorService` will fallback to `process.env.ERROR_URL_WEBHOOK` or `/`.
	 *
	 * @param url - The endpoint of the external error-handling service
	 */
	setErrorHandlerService(url: string) {
		this._handleErrorServiceUrl = url;
	}

	/**
	 * Retrieves the current in-memory log buffer.
	 *
	 * This method returns an array of `LogEntry` objects representing
	 * all logs recorded so far, up to the configured maximum buffer size.
	 *
	 * Use this for debugging, testing, or exporting logs, but be aware
	 * that it does not persist logs to any external storage or service.
	 *
	 * @returns An array of `LogEntry` objects currently stored in the logger.
	 */
	getLogs() {
		return this._logs;
	}

	/** Sends a log entry to an external error-handling service. */
	private async _sendToErrorService(entry: LogEntry): Promise<void> {
		try {
			await fetch(
				process.env.ERROR_URL_WEBHOOK ?? this._handleErrorServiceUrl ?? "/",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: this._safeStringify(entry),
				}
			);
		} catch (err) {
			const normalized = normalizeError(err);
			console.error("Failed to send log to service:", normalized.message);
		}
	}

	/** Sends a log entry to the audit-logger service via HTTPS using TLS mutual auth. */
	private async _sendToAuditService(entry: LogEntry): Promise<void> {
		if (!this._auditResolver) {
			return;
		}
		let auditTarget: {
			url: string;
			tls: { key: string; cert: string; ca: string };
		} | null;
		try {
			auditTarget = await this._auditResolver();
		} catch {
			return;
		}
		if (!auditTarget) {
			return;
		}
		try {
			const body = this._safeStringify(entry);
			const urlObj = new URL(auditTarget.url);
			const opts = {
				hostname: urlObj.hostname,
				port: urlObj.port ? Number(urlObj.port) : 443,
				path: "/api/logs",
				method: "POST" as const,
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body).toString(),
				},
				key: auditTarget.tls.key,
				cert: auditTarget.tls.cert,
				ca: auditTarget.tls.ca,
				rejectUnauthorized: true,
			};
			await new Promise<void>((resolve, reject) => {
				const req = httpsRequest(opts, (res) => {
					res.on("data", () => {});
					res.on("end", () => resolve());
				});
				req.on("error", reject);
				req.write(body);
				req.end();
			});
		} catch (err) {
			const normalized = normalizeError(err);
			console.error("Failed to send log to audit service:", normalized.message);
		}
	}

	setAuditResolver(
		resolver: () => Promise<{
			url: string;
			tls: { key: string; cert: string; ca: string };
		} | null>
	): void {
		this._auditResolver = resolver;
	}
}

/** Global logger instance pre-configured based on the current environment. */
export const logger = new Logger(
	process.env.NODE_ENV === "development"
		? LogLevel.Debug
		: process.env.NODE_ENV === "staging"
			? LogLevel.Info
			: LogLevel.Warn
);

export const LOGGER = Logger;
