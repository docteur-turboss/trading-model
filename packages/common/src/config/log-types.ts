export enum LogLevel {
	Debug = 0,
	Info = 1,
	Warn = 2,
	Error = 3,
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
