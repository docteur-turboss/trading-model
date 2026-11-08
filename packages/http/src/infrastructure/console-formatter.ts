import { trace } from "@opentelemetry/api";
import type { JsonObject } from "@trading-model/primitives/primitives";
import { getCorrelationId } from "../adapters/inbound/correlation-id";
import { safeStringify } from "./sensitive-data-sanitizer";

export interface FormatLogEntryParams {
	label: string;
	timestamp: number;
	message: string;
	context?: JsonObject;
}

/**
 * Formats a log entry as a single-line JSON object (promtail `json` stage
 * compatible). Emits `{ ts, level, msg, ...ambient, ...context }`. Ambient
 * fields: `service` / `instance` (`SERVICE_NAME` / `INSTANCE_ID`), `correlationId`
 * (AsyncLocalStorage) and `trace_id` / `span_id` (active OpenTelemetry span);
 * each is omitted when unknown. A field of the same name in `context` wins.
 * Circular references are rendered as `[Circular]` and sensitive keys are
 * redacted.
 */
function ambientFields(): JsonObject {
	const span = trace.getActiveSpan()?.spanContext();
	const fields: Record<string, string | undefined> = {
		service: process.env.SERVICE_NAME,
		instance: process.env.INSTANCE_ID,
		correlationId: getCorrelationId(),
		trace_id: span && trace.isSpanContextValid(span) ? span.traceId : undefined,
		span_id: span && trace.isSpanContextValid(span) ? span.spanId : undefined,
	};
	return Object.fromEntries(
		Object.entries(fields).filter(
			([, value]) => value !== undefined && value !== ""
		)
	) as JsonObject;
}

export function formatLogEntry(params: FormatLogEntryParams): string {
	const record: JsonObject = {
		ts: new Date(params.timestamp).toISOString(),
		level: params.label,
		msg: params.message,
		...ambientFields(),
		...(params.context ?? {}),
	};
	return safeStringify(record);
}
