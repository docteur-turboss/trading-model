import type {
	JsonObject,
	ProcessId,
	ServiceId,
	UnixTimestamp,
	URLString,
	UserId,
} from "@trading-model/primitives/primitives";

/** Log severity levels, from the most verbose to the most critical. */
export enum LogLevel {
	Debug = "debug",
	Info = "info",
	Warn = "warn",
	Error = "error",
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	[LogLevel.Debug]: 0,
	[LogLevel.Info]: 1,
	[LogLevel.Warn]: 2,
	[LogLevel.Error]: 3,
};

/** True when a level is at or above the threshold. */
export function isLogLevelAtLeast(
	level: LogLevel,
	threshold: LogLevel
): boolean {
	return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[threshold];
}

/** Optional context attached to a log entry. */
export interface LogOptions {
	context?: JsonObject;
	url?: URLString;
	serviceInCharge?: ServiceId;
}

/** Structured log entry, as written to the logs. */
export interface LogEntry {
	timestamp: UnixTimestamp;
	level: LogLevel;
	message: string;
	context?: JsonObject;
	userId?: UserId;
	processId?: ProcessId;
	url?: URLString;
	serviceInCharge?: ServiceId;
}
