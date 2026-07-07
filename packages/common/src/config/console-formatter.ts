export function formatLogEntry(
	label: string,
	timestamp: Date,
	message: string,
	context?: Record<string, unknown>
): string {
	const contextStr = context ? ` ${JSON.stringify(context)}` : "";
	return `[${label}] [${timestamp.toISOString()}] ${message}${contextStr}`;
}
