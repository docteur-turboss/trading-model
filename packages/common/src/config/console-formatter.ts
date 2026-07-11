import type { JsonObject } from "../domain/primitives";

export interface FormatLogEntryParams {
	label: string;
	timestamp: number;
	message: string;
	context?: JsonObject;
}

export function formatLogEntry(params: FormatLogEntryParams): string {
	const contextStr = params.context ? ` ${JSON.stringify(params.context)}` : "";
	return `[${params.label}] [${new Date(params.timestamp).toISOString()}] ${params.message}${contextStr}`;
}
