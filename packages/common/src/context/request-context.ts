import { AsyncLocalStorage } from "node:async_hooks";

import type { Request } from "express";
import type { CorrelationId } from "../domain/primitives";
import type { ClientIdentity } from "../domain/primitives/string-ids";
import { HTTP_HEADERS } from "../http-headers";

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
	const store: RequestStore = {
		clientIdentity:
			((req as unknown as Record<string, string>).clientIdentity ?? "unknown") as ClientIdentity,
		requestId: ((req.headers[HTTP_HEADERS.X_REQUEST_ID] as string) ??
			(req as unknown as Record<string, string>).correlationId ??
			"") as CorrelationId,
		correlationId: ((req as unknown as Record<string, string>).correlationId ??
			"") as CorrelationId,
	};
	REQUEST_CONTEXT.run(store, next);
}
