import { appendFile } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { LogEntry, LogLevel } from "./log-types";
import type { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

export class LogFileWriter {
	constructor(private readonly _sanitizer: SensitiveDataSanitizer) {}

	write(data: LogEntry, level: LogLevel): void {
		const logDir = process.env.LOG_DIR;
		if (!logDir) {
			return;
		}
		const ts =
			data.timestamp instanceof Date
				? data.timestamp
				: new Date(data.timestamp);
		const year = ts.getFullYear();
		const month = ts.getMonth() + 1;
		const day = ts.getDate();
		const logFilePath = path.resolve(logDir);
		const logFileName = `${year}.${month}.${day}-${level}.log`;

		mkdir(logFilePath, { recursive: true }).catch(() => {});
		appendFile(
			path.resolve(logFilePath, logFileName),
			`${this._sanitizer.safeStringify(data)}\n`,
			(err) => {
				if (err) {
					console.error("[Logger] Failed to write log file:", err);
				}
			}
		);
	}
}
