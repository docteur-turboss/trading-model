import {
	type ProcessId,
	UnixTimestamp,
	type UserId,
} from "@trading-model/primitives/primitives";
import { sendError } from "../adapters/outbound/error-service-sender";
import { getNodeEnv } from "../shared/node-env";
import type { LogEntry, LogLevel, LogOptions } from "./log-types";
export class LogDispatcher {
	private readonly _safeStringify: (value: unknown) => string;
	private readonly _processId: ProcessId;
	private readonly _env: string | undefined;

	constructor(safeStringify: (value: unknown) => string, processId: ProcessId) {
		this._safeStringify = safeStringify;
		this._processId = processId;
		this._env = getNodeEnv();
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
			processId: this._processId || undefined,
			userId: userId || undefined,
			url,
			serviceInCharge,
		};

		return data;
	}

	sendError(logEntry: LogEntry): void {
		void sendError(this._safeStringify, logEntry, this._env);
	}
}
