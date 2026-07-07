import type { LogEntry } from "./log-types";
import { CircularBuffer } from "../utils/circular-buffer";

export class LogBuffer {
	private readonly _buffer: CircularBuffer<LogEntry>;

	constructor(maxLogs = 1000) {
		this._buffer = new CircularBuffer<LogEntry>(maxLogs);
	}

	add(logEntry: LogEntry): void {
		this._buffer.add(logEntry);
	}

	getAll(): LogEntry[] {
		return this._buffer.getAll();
	}
}
