import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { RequestHandler, Router } from "express";
import { catchSync } from "../catch-error";
import type { ResponseObject } from "../response-exception/http-codes";
import { sendResponse } from "../response-exception/send-response";
import { type ApiRoute, type ApiRouteInput, parseRequest } from "./api-route";

export type ApiRouteHandler<Route extends ApiRoute> = (
	input: ApiRouteInput<Route>,
	req: Parameters<RequestHandler>[0]
) => ResponseObject | Promise<ResponseObject>;

export interface MountRouteOptions {
	/** Run before validation, in order (rate limiters, request signature...). */
	middlewares?: RequestHandler[];
}

const METHODS = {
	GET: "get",
	POST: "post",
	PUT: "put",
	PATCH: "patch",
	DELETE: "delete",
} as const;

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
	router[METHODS[route.method]](
		route.path,
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
