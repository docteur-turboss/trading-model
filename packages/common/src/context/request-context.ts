import { AsyncLocalStorage } from "node:async_hooks";

import type { Request } from "express";
import { CorrelationId } from "../domain/primitives";
import { ClientIdentity } from "../domain/primitives/string-ids";
import { HTTP_HEADERS } from "../http-headers";

interface RequestExtra {
	clientIdentity?: string;
	correlationId?: string;
}

/**
 * Per-request storage for propagating identity and metadata
 * across async boundaries (e.g., when making outbound HTTP calls).
 */
export interface RequestStore {
	clientIdentity: ClientIdentity;
	requestId: CorrelationId;
	correlationId: CorrelationId;
}

export const REQUEST_CONTEXT = new AsyncLocalStorage<RequestStore>();

/**
 * Express middleware that initializes the async context from the request.
 * Mount this after correlationIdMiddleware so `correlationId` is available.
 */
export function requestContextMiddleware(
	req: Request,
	_res: unknown,
	next: () => void
): void {
	const extra = req as RequestExtra;
	const store: RequestStore = {
		clientIdentity: ClientIdentity.of(extra.clientIdentity ?? "unknown"),
		requestId: CorrelationId.of(
			(req.headers[HTTP_HEADERS.X_REQUEST_ID] as string) ??
				extra.correlationId ??
				"unknown"
		),
		correlationId: CorrelationId.of(extra.correlationId ?? "unknown"),
	};
	REQUEST_CONTEXT.run(store, next);
}
