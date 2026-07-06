import { appendFile } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { LogEntry, LogLevel } from "./log-types";
import type { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

export class LogFileWriter {
	constructor(private readonly _sanitizer: SensitiveDataSanitizer) {}

	private _buildLogFileName(data: LogEntry, level: LogLevel): string {
		const ts = data.timestamp instanceof Date ? data.timestamp : new Date(data.timestamp);
		return `${ts.getFullYear()}.${ts.getMonth() + 1}.${ts.getDate()}-${level}.log`;
	}

	private _appendToFile(filePath: string, data: LogEntry): void {
		appendFile(filePath, `${this._sanitizer.safeStringify(data)}\n`, (err) => {
			if (err) {
				console.error("[Logger] Failed to write log file:", err);
			}
		});
	}

	write(data: LogEntry, level: LogLevel): void {
		const logDir = process.env.LOG_DIR;
		if (!logDir) {
			return;
		}
		const logFilePath = path.resolve(logDir);
		mkdir(logFilePath, { recursive: true }).catch(() => {});
		this._appendToFile(path.resolve(logFilePath, this._buildLogFileName(data, level)), data);
	}
}
