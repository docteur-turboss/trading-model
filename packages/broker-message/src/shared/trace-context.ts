import { context, propagation, ROOT_CONTEXT } from "@opentelemetry/api";
import type { MessageMetadata } from "@trading-model/contracts/message-types";

/** W3C Trace Context `traceparent`: version-traceid-parentid-flags, lowercase hex. */
export const TRACEPARENT_PATTERN =
	/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

/**
 * Returns the metadata with the `traceparent` of the active span, so that the
 * delivery, journaled and sent later, continues the publisher's trace.
 * Unchanged when no span is active (telemetry off).
 */
export function withTraceparent(metadata: MessageMetadata): MessageMetadata {
	const carrier: Record<string, string> = {};
	propagation.inject(context.active(), carrier);
	return carrier.traceparent
		? { ...metadata, traceparent: carrier.traceparent }
		: metadata;
}

/**
 * Runs `fn` in the trace context the message was published in: the spans it
 * starts (the delivery request) join the publisher's trace.
 */
export function runInMessageTraceContext<TResult>(
	metadata: Pick<MessageMetadata, "traceparent">,
	fn: () => TResult
): TResult {
	if (!metadata.traceparent) {
		return fn();
	}
	const parent = propagation.extract(ROOT_CONTEXT, {
		traceparent: metadata.traceparent,
	});
	return context.with(parent, fn);
}
