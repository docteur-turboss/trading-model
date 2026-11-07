import type {
	JsonObject,
	ProcessId,
	ServiceId,
	UnixTimestamp,
	URLString,
	UserId,
} from "@trading-model/primitives/primitives";

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

export function isLogLevelAtLeast(
	level: LogLevel,
	threshold: LogLevel
): boolean {
	return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[threshold];
}

export interface LogOptions {
	context?: JsonObject;
	url?: URLString;
	serviceInCharge?: ServiceId;
}

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
