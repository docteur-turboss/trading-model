import { AuditServiceClient } from "./audit-service-client";
import { ErrorServiceSender } from "./error-service-sender";
import { LogFileWriter } from "./log-file-writer";
import { LogLevel, type LogEntry, type LogOptions } from "./log-types";
export type { LogEntry, LogOptions };
export { LogLevel };
import { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

/** Structured logger with multiple severity levels. */
export class Logger {
	private _logLevel: LogLevel;
	private _logs: LogEntry[] = [];
	private _maxLogs = 1000;
	private _sessionId: string | null;
	private _userId: string | null = null;
	private readonly _sanitizer: SensitiveDataSanitizer;
	private readonly _auditClient: AuditServiceClient;
	private readonly _logFileWriter: LogFileWriter;
	private readonly _errorServiceSender: ErrorServiceSender;

	constructor(logLevel: LogLevel = LogLevel.Info) {
		this._logLevel = logLevel;
		this._sessionId = this._generateSessionId();
		this._sanitizer = new SensitiveDataSanitizer();
		this._auditClient = new AuditServiceClient(this._sanitizer);
		this._logFileWriter = new LogFileWriter(this._sanitizer);
		this._errorServiceSender = new ErrorServiceSender(
			this._sanitizer,
			process.env.NODE_ENV
		);
	}

	private _generateSessionId(): string {
		const now = new Date();
		return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${this._logLevel}_${(crypto.getRandomValues(new Uint32Array(10))[0] * 2 ** -32).toString(36).substring(2, 10)}`;
	}

	private _shouldLog(level: LogLevel): boolean {
		return level >= this._logLevel;
	}

	private _maybeSendToAudit(data: LogEntry, level: LogLevel): void {
		if (level >= LogLevel.Info) {
			void this._auditClient.send(data as unknown as Record<string, unknown>);
		}
	}

	private _createLogEntry(level: LogLevel, message: string, opts?: LogOptions): LogEntry {
		const { context, url = "", serviceInCharge = "" } = opts ?? {};
		const { level, message, context, url = "", serviceInCharge = "" } = input;
		const now = new Date();
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

		this._logFileWriter.write(data, level);
		this._maybeSendToAudit(data, level);

		return data;
	}

	private _addToBuffer(logEntry: LogEntry) {
		this._logs.push(logEntry);
		if (this._logs.length > this._maxLogs) {
			this._logs.shift();
		}
	}

	debug(
		message: string,
		context?: Record<string, unknown>,
		url?: string,
		serviceInCharge?: string
	) {
		if (!this._shouldLog(LogLevel.Debug)) {
			return;
		}

		const logEntry = this._createLogEntry({
			level: LogLevel.Debug,
			message,
			context,
			url,
			serviceInCharge,
		});
		this._addToBuffer(logEntry);
		console.debug(
			`[DEBUG] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	info(
		message: string,
		context?: Record<string, unknown>,
		url?: string,
		serviceInCharge?: string
	) {
		if (!this._shouldLog(LogLevel.Info)) {
			return;
		}

		const logEntry = this._createLogEntry({
			level: LogLevel.Info,
			message,
			context,
			url,
			serviceInCharge,
		});
		this._addToBuffer(logEntry);
		console.info(
			`[INFO] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	warn(
		message: string,
		context?: Record<string, unknown>,
		url?: string,
		serviceInCharge?: string
	) {
		if (!this._shouldLog(LogLevel.Warn)) {
			return;
		}

		const logEntry = this._createLogEntry({
			level: LogLevel.Warn,
			message,
			context,
			url,
			serviceInCharge,
		});
		this._addToBuffer(logEntry);
		console.warn(
			`[WARN] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);
	}

	error(
		message: string,
		context?: Record<string, unknown>,
		url?: string,
		serviceInCharge?: string
	) {
		if (!this._shouldLog(LogLevel.Error)) {
			return;
		}

		const logEntry = this._createLogEntry({
			level: LogLevel.Error,
			message,
			context,
			url,
			serviceInCharge,
		});
		this._addToBuffer(logEntry);
		console.error(
			`[ERROR] [${logEntry.timestamp.toISOString()}] ${message}`,
			context || ""
		);

		void this._errorServiceSender.send(logEntry);
	}

	setUserId(userId: string) {
		this._userId = userId;
	}

	setErrorHandlerService(url: string) {
		this._errorServiceSender.setErrorHandlerService(url);
	}

	getLogs() {
		return this._logs;
	}

	setAuditResolver(
		resolver: () => Promise<{
			url: string;
			tls: { key: string; cert: string; ca: string };
		} | null>
	): void {
		this._auditClient.setAuditResolver(resolver);
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
