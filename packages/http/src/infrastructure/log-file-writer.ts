import { appendFile } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { LogEntry, LogLevel } from "./log-types";

function _buildLogFileName(data: LogEntry, level: LogLevel): string {
	const ts = new Date(data.timestamp);
	return `${ts.getFullYear()}.${ts.getMonth() + 1}.${ts.getDate()}-${level}.log`;
}

function _appendToFile(
	filePath: string,
	data: LogEntry,
	safeStringify: (value: unknown) => string
): void {
	appendFile(filePath, `${safeStringify(data)}\n`, (err) => {
		if (err) {
			console.error("[Logger] Failed to write log file:", err);
		}
	});
}

export function writeLogFile(
	data: LogEntry,
	level: LogLevel,
	safeStringify: (value: unknown) => string
): void {
	const logDir = process.env.LOG_DIR;
	if (!logDir) {
		return;
	}
	const logFilePath = path.resolve(logDir);
	mkdir(logFilePath, { recursive: true }).catch(() => {});
	_appendToFile(
		path.resolve(logFilePath, _buildLogFileName(data, level)),
		data,
		safeStringify
	);
}
