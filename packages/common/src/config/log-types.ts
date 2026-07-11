export enum LogLevel {
	Debug = "debug",
	Info = "info",
	Warn = "warn",
	Error = "error",
}

export class LogLevelThreshold {
	private readonly _priority: number;

	private constructor(priority: number) {
		this._priority = priority;
	}

	static readonly DEBUG = new LogLevelThreshold(0);
	static readonly INFO = new LogLevelThreshold(1);
	static readonly WARN = new LogLevelThreshold(2);
	static readonly ERROR = new LogLevelThreshold(3);

	static fromLogLevel(level: LogLevel): LogLevelThreshold | undefined {
		return LEVEL_THRESHOLD_MAP[level];
	}

	static isAtLeast(level: LogLevel, threshold: LogLevel): boolean {
		const levelThreshold = LogLevelThreshold.fromLogLevel(level);
		const thresholdValue = LogLevelThreshold.fromLogLevel(threshold);
		if (!(levelThreshold && thresholdValue)) {
			return false;
		}
		return levelThreshold._priority >= thresholdValue._priority;
	}
}

const LEVEL_THRESHOLD_MAP: Record<LogLevel, LogLevelThreshold> = {
	[LogLevel.Debug]: LogLevelThreshold.DEBUG,
	[LogLevel.Info]: LogLevelThreshold.INFO,
	[LogLevel.Warn]: LogLevelThreshold.WARN,
	[LogLevel.Error]: LogLevelThreshold.ERROR,
};

export function isLogLevelAtLeast(
	level: LogLevel,
	threshold: LogLevel
): boolean {
	return LogLevelThreshold.isAtLeast(level, threshold);
}

import type {
	JsonObject,
	ServiceId,
	SessionId,
	UnixTimestamp,
	URLString,
	UserId,
} from "../domain/primitives";

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
	sessionId?: SessionId;
	url?: URLString;
	serviceInCharge?: ServiceId;
}
