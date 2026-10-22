import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import {
	type CorrelationId,
	toCorrelationId,
} from "@trading-model/primitives/primitives";
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

export function correlationIdMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
): void {
	const existing =
		req.headers[HTTP_HEADERS.CORRELATION_ID] ??
		req.headers[HTTP_HEADERS.X_REQUEST_ID];
	const correlationId =
		typeof existing === "string" && existing.length > 0
			? toCorrelationId(existing)
			: toCorrelationId(randomUUID());

	req.correlationId = correlationId;
	res.setHeader(HTTP_HEADERS.CORRELATION_ID, correlationId);

	correlationStore.run(correlationId, () => next());
}
