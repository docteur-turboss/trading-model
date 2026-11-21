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
