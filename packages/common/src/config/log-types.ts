export type LogLevel = "debug" | "info" | "warn" | "error";

export const LogLevel = {
	Debug: "debug" as LogLevel,
	Info: "info" as LogLevel,
	Warn: "warn" as LogLevel,
	Error: "error" as LogLevel,
};

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
			case "debug":
				return LogPriority.DEBUG;
			case "info":
				return LogPriority.INFO;
			case "warn":
				return LogPriority.WARN;
			case "error":
				return LogPriority.ERROR;
			default:
				throw new Error(`Unknown log level: ${level}`);
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
