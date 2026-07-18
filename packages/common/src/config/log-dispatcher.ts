import {
	type SessionId,
	UnixTimestamp,
	type URLString,
	type UserId,
} from "../domain/primitives";
import type { TlsPaths } from "../domain/tls-paths";
import { AuditServiceClient } from "./audit-service-client";
import { sendError } from "./error-service-sender";
import { writeLogFile } from "./log-file-writer";
import {
	type LogEntry,
	LogLevel,
	LogLevelThreshold,
	type LogOptions,
} from "./log-types";
import { getNodeEnv } from "./node-env";
export class LogDispatcher {
	private readonly _safeStringify: (value: unknown) => string;
	private _auditClient: AuditServiceClient;
	private readonly _sessionId: SessionId;
	private readonly _env: string | undefined;

	constructor(safeStringify: (value: unknown) => string, sessionId: SessionId) {
		this._safeStringify = safeStringify;
		this._sessionId = sessionId;
		this._env = getNodeEnv();
		this._auditClient = new AuditServiceClient(this._safeStringify);
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

		writeLogFile(data, level, this._safeStringify);
		this._maybeSendToAudit(data, level);

		return data;
	}

	setAuditResolver(
		resolver: () => Promise<{
			url: URLString;
			tls: TlsPaths;
		} | null>
	): void {
		this._auditClient = new AuditServiceClient(this._safeStringify, resolver);
	}

	sendError(logEntry: LogEntry): void {
		void sendError(this._safeStringify, logEntry, this._env);
	}
}
