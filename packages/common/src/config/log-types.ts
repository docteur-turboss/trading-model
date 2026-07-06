export type LogLevel = "debug" | "info" | "warn" | "error";

export const LogLevel = {
	Debug: "debug" as LogLevel,
	Info: "info" as LogLevel,
	Warn: "warn" as LogLevel,
	Error: "error" as LogLevel,
};

const LOG_PRIORITY_MAP: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export function isLogLevelAtLeast(
	level: LogLevel,
	threshold: LogLevel
): boolean {
	return LOG_PRIORITY_MAP[level] >= LOG_PRIORITY_MAP[threshold];
}

export interface LogOptions {
	context?: Record<string, unknown>;
	url?: string;
	serviceInCharge?: string;
}

export interface LogEntry {
	timestamp: Date;
	level: LogLevel;
	message: string;
	context?: Record<string, unknown>;
	userId?: string;
	sessionId?: string;
	url?: string;
	serviceInCharge?: string;
}
