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

	static fromLogLevel(level: LogLevel): LogPriority {
		switch (level) {
			case LogLevel.Debug:
				return LogPriority.DEBUG;
			case LogLevel.Info:
				return LogPriority.INFO;
			case LogLevel.Warn:
				return LogPriority.WARN;
			case LogLevel.Error:
				return LogPriority.ERROR;
			default:
				return LogPriority.DEBUG;
		}
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
