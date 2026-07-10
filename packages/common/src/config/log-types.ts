export enum LogLevel {
	Debug = "debug",
	Info = "info",
	Warn = "warn",
	Error = "error",
}

class LogPriority {
	readonly value: number;
	private constructor(value: number) {
		this.value = value;
	}

	static readonly DEBUG = new LogPriority(0);
	static readonly INFO = new LogPriority(1);
	static readonly WARN = new LogPriority(2);
	static readonly ERROR = new LogPriority(3);

	private static readonly LEVEL_MAP: Record<LogLevel, LogPriority> = {
		[LogLevel.Debug]: LogPriority.DEBUG,
		[LogLevel.Info]: LogPriority.INFO,
		[LogLevel.Warn]: LogPriority.WARN,
		[LogLevel.Error]: LogPriority.ERROR,
	};

	static fromLogLevel(level: LogLevel): LogPriority {
		return LogPriority.LEVEL_MAP[level] ?? LogPriority.DEBUG;
	}

	canLog(threshold: LogPriority): boolean {
		return this.value >= threshold.value;
	}
}

export function isLogLevelAtLeast(
	level: LogLevel,
	threshold: LogLevel
): boolean {
	return LogPriority.fromLogLevel(level).canLog(
		LogPriority.fromLogLevel(threshold)
	);
}

import type { JsonObject, ServiceId, SessionId, URLString, UserId } from "../domain/primitives";

export interface LogOptions {
	context?: JsonObject;
	url?: URLString;
	serviceInCharge?: ServiceId;
}

export interface LogEntry {
	timestamp: Date;
	level: LogLevel;
	message: string;
	context?: JsonObject;
	userId?: UserId;
	sessionId?: SessionId;
	url?: URLString;
	serviceInCharge?: ServiceId;
}
