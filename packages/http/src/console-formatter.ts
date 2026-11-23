import { trace } from "@opentelemetry/api";
import type { JsonObject } from "@trading-model/primitives/primitives";
import { getCorrelationId } from "./correlation-id";
import { safeStringify } from "./sensitive-data-sanitizer";

/** Inputs of the console formatter for one log entry. */
export interface FormatLogEntryParams {
	label: string;
	timestamp: number;
	message: string;
	context?: JsonObject;
}

function defined(fields: JsonObject): JsonObject {
	return Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined)
	) as JsonObject;
}

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

/**
 * Formats a log entry as a single-line JSON object (promtail `json` stage
 * compatible). Emits `{ ts, level, msg, ...ambient, ...context }`. Ambient
 * fields: `service` / `instance` (`SERVICE_NAME` / `INSTANCE_ID`), `correlationId`
 * (AsyncLocalStorage) and `trace_id` / `span_id` (active OpenTelemetry span);
 * each is omitted when unknown. A field of the same name in `context` wins,
 * except `service` / `instance`, which always identify the emitting process
 * (use e.g. `targetService` for another one). An `undefined` context value
 * never erases an ambient field. A plain-object `context.context` is flattened
 * to the first level (other top-level keys win on collision).
 * Circular references are rendered as `[Circular]` and sensitive keys are
 * redacted.
 */
export function formatLogEntry(params: FormatLogEntryParams): string {
	const ambient = ambientFields();
	const { context: nested, ...top } = defined(params.context ?? {});
	const context =
		typeof nested === "object" && nested !== null && !Array.isArray(nested)
			? { ...defined(nested as JsonObject), ...top }
			: defined(params.context ?? {});
	const record: JsonObject = {
		ts: new Date(params.timestamp).toISOString(),
		level: params.label,
		msg: params.message,
		...ambient,
		...context,
		service: ambient.service ?? context.service,
		instance: ambient.instance ?? context.instance,
	};
	return safeStringify(record);
}
