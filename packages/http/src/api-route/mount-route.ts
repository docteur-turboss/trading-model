import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { RequestHandler, Router } from "express";
import { catchSync } from "../catch-error";
import { type ResponseObject, sendResponse } from "../response-exception";
import { type ApiRoute, type ApiRouteInput, parseRequest } from "./api-route";

/** Handler of an API route: receives the validated input and the Express request. */
export type ApiRouteHandler<Route extends ApiRoute> = (
	input: ApiRouteInput<Route>,
	req: Parameters<RequestHandler>[0]
) => ResponseObject | Promise<ResponseObject>;

/** Options for mounting an API route on an Express router. */
export interface MountRouteOptions {
	/** Run before validation, in order (rate limiters, request signature...). */
	middlewares?: RequestHandler[];
}

/**
 * Mounts a registry entry on the router (ADR-0021): the method and path come
 * from the entry, params, query and body are parsed with its schemas (400
 * with an `ErrorResponse` when they fail), and the handler gets the parsed
 * values. Errors the handler throws go to the Express error handler.
 */
export function mountRoute<Route extends ApiRoute>(
	router: Router,
	route: Route,
	handler: ApiRouteHandler<Route>,
	options: MountRouteOptions = {}
): void {
	const unversioned = route.path.replace(/^\/v\d+(?=\/)/, "");
	router[route.method.toLowerCase() as Lowercase<typeof route.method>](
		// shortcut: also mounted without /v<major> for v3.1.0 gateways and callers during the rollout; removed once a release with the /v<major> gateway is N-1 (#2587, ADR-0072).
		unversioned === route.path ? route.path : [route.path, unversioned],
		...(options.middlewares ?? []),
		catchSync((req) => {
			const parsed = parseRequest(route, req);
			if (!parsed.success) {
				return sendResponse(parsed.error, HTTP_STATUS.BAD_REQUEST);
			}
			return handler(parsed.input, req);
		})
	);
}
