import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { HTTP_HEADERS } from "../http-headers";

declare module "express-serve-static-core" {
	interface Request {
		correlationId: string;
	}
}

export function correlationIdMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
): void {
	const existing =
		req.headers[HTTP_HEADERS.CORRELATION_ID] ?? req.headers[HTTP_HEADERS.X_REQUEST_ID];
	const correlationId =
		typeof existing === "string" && existing.length > 0
			? existing
			: randomUUID();

	req.correlationId = correlationId;
	res.setHeader(HTTP_HEADERS.CORRELATION_ID, correlationId);

	next();
}
