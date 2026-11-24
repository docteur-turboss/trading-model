import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { normalizeError } from "@trading-model/common/utils/errors";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import { CorrelationId } from "@trading-model/primitives/primitives";
import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
	interface Request {
		correlationId: CorrelationId;
	}
}

const correlationStore = new AsyncLocalStorage<CorrelationId>();

/**
 * Returns the correlation id of the current request, when executed inside the
 * middleware's async context. Used by outbound adapters to propagate the id
 * to downstream services.
 */
export function getCorrelationId(): CorrelationId | undefined {
	return correlationStore.getStore();
}

/**
 * Runs `fn` inside an async context bound to `correlationId` so outbound
 * requests spawned within it propagate the id on outgoing headers.
 */
export function runWithCorrelationId<TResult>(
	correlationId: CorrelationId,
	fn: () => TResult
): TResult {
	return correlationStore.run(correlationId, fn);
}

/**
 * Runs a background job as one root span and one fresh correlation id, so its
 * logs and outbound calls share a trace. A rejection is passed to `onError`
 * (still inside the span and correlation id, so its log carries both), recorded
 * on the span, then rethrown: the caller keeps its own error handling.
 */
export function runJob<TResult>(
	name: string,
	fn: () => Promise<TResult>,
	onError?: (err: unknown) => void
): Promise<TResult> {
	return trace
		.getTracer("background-job")
		.startActiveSpan(name, { root: true }, (span) =>
			runWithCorrelationId(CorrelationId.of(randomUUID()), async () => {
				try {
					return await fn();
				} catch (err) {
					const error = normalizeError(err);
					onError?.(err);
					span.recordException(error);
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: error.message,
					});
					throw err;
				} finally {
					span.end();
				}
			})
		);
}

// An external client must not inject arbitrary data into logs: other ids are replaced.
const VALID_INCOMING_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Express middleware that attaches a correlation id to the request and the response. */
export function correlationIdMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
): void {
	const existing =
		req.headers[HTTP_HEADERS.CORRELATION_ID] ??
		req.headers[HTTP_HEADERS.X_REQUEST_ID];
	const correlationId =
		typeof existing === "string" && VALID_INCOMING_ID.test(existing)
			? CorrelationId.of(existing)
			: CorrelationId.of(randomUUID());

	req.correlationId = correlationId;
	res.setHeader(HTTP_HEADERS.CORRELATION_ID, correlationId);

	correlationStore.run(correlationId, () => next());
}

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Correlation id of the current request when it can ride a bus message, whose
 * schema only accepts UUIDs (the middleware also keeps non-UUID client ids).
 */
export function getBusCorrelationId(): CorrelationId | undefined {
	const id = correlationStore.getStore();
	return id && UUID.test(id) ? id : undefined;
}
