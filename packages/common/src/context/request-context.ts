import { AsyncLocalStorage } from "node:async_hooks";

import type { Request } from "express";

/**
 * Per-request storage for propagating identity and metadata
 * across async boundaries (e.g., when making outbound HTTP calls).
 */
export interface RequestStore {
	clientIdentity: string;
	requestId: string;
	correlationId: string;
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
			(req as unknown as Record<string, string>).clientIdentity ?? "unknown",
		requestId:
			(req.headers["x-request-id"] as string) ??
			(req as unknown as Record<string, string>).correlationId ??
			"",
		correlationId:
			(req as unknown as Record<string, string>).correlationId ?? "",
	};
	REQUEST_CONTEXT.run(store, next);
}
