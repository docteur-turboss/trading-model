import type { LogEntry } from "./log-types";

export class LogBuffer {
	private readonly _logs: LogEntry[] = [];
	private readonly _maxLogs: number;

	constructor(maxLogs = 1000) {
		this._maxLogs = maxLogs;
	}

	add(logEntry: LogEntry): void {
		this._logs.push(logEntry);
		if (this._logs.length > this._maxLogs) {
			this._logs.shift();
		}
	}

	getAll(): LogEntry[] {
		return this._logs;
	}
}
