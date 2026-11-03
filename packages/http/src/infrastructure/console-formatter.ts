import type { JsonObject } from "@trading-model/primitives/primitives";
import { safeStringify } from "./sensitive-data-sanitizer";

export interface FormatLogEntryParams {
	label: string;
	timestamp: number;
	message: string;
	context?: JsonObject;
}

/**
 * Formats a log entry as a single-line JSON object (promtail `json` stage
 * compatible). Emits `{ ts, level, msg, ...context }`. Circular references are
 * rendered as `[Circular]` and sensitive keys are redacted.
 */
export function formatLogEntry(params: FormatLogEntryParams): string {
	const record: JsonObject = {
		ts: new Date(params.timestamp).toISOString(),
		level: params.label,
		msg: params.message,
		...(params.context ?? {}),
	};
	return safeStringify(record);
}
