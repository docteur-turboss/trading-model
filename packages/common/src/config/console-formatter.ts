import type { JsonObject } from "../domain/primitives";

export function formatLogEntry(
	label: string,
	timestamp: Date,
	message: string,
	context?: JsonObject
): string {
	const contextStr = context ? ` ${JSON.stringify(context)}` : "";
	return `[${label}] [${timestamp.toISOString()}] ${message}${contextStr}`;
}
