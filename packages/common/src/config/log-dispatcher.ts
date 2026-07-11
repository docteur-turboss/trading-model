import {
	type SessionId,
	UnixTimestamp,
	type URLString,
	type UserId,
} from "../domain/primitives";
import type { TlsPaths } from "../domain/tls-paths";
import { AuditServiceClient } from "./audit-service-client";
import { ErrorServiceSender } from "./error-service-sender";
import { LogFileWriter } from "./log-file-writer";
import {
	type LogEntry,
	LogLevel,
	LogLevelThreshold,
	type LogOptions,
} from "./log-types";
import { getNodeEnv } from "./node-env";
import type { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

export class LogDispatcher {
	private readonly _sanitizer: SensitiveDataSanitizer;
	private _auditClient: AuditServiceClient;
	private readonly _logFileWriter: LogFileWriter;
	private readonly _errorServiceSender: ErrorServiceSender;
	private readonly _sessionId: SessionId;

	constructor(sanitizer: SensitiveDataSanitizer, sessionId: SessionId) {
		this._sanitizer = sanitizer;
		this._sessionId = sessionId;
		this._auditClient = new AuditServiceClient(this._sanitizer);
		this._logFileWriter = new LogFileWriter(this._sanitizer);
		this._errorServiceSender = new ErrorServiceSender(
			this._sanitizer,
			getNodeEnv()
		);
	}

	private _maybeSendToAudit(data: LogEntry, level: LogLevel): void {
		if (LogLevelThreshold.isAtLeast(level, LogLevel.Info)) {
			void this._auditClient.send(data as unknown as Record<string, unknown>);
		}
	}

	createLogEntry(
		level: LogLevel,
		message: string,
		userId: UserId,
		opts?: LogOptions
	): LogEntry {
		const { context, url, serviceInCharge } = opts ?? {};
		const data: LogEntry = {
			timestamp: UnixTimestamp.now(),
			level,
			message,
			context,
			sessionId: this._sessionId || undefined,
			userId: userId || undefined,
			url,
			serviceInCharge,
		};

		this._logFileWriter.write(data, level);
		this._maybeSendToAudit(data, level);

		return data;
	}

	setAuditResolver(
		resolver: () => Promise<{
			url: URLString;
			tls: TlsPaths;
		} | null>
	): void {
		this._auditClient = new AuditServiceClient(this._sanitizer, resolver);
	}

	sendError(logEntry: LogEntry): void {
		void this._errorServiceSender.send(logEntry);
	}
}
