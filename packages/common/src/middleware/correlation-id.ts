import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
	interface Request {
		correlationId: string;
	}
}

const CORRELATION_ID_HEADER = "x-correlation-id";

export function correlationIdMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
): void {
	const existing =
		req.headers[CORRELATION_ID_HEADER] ?? req.headers["x-request-id"];
	const correlationId =
		typeof existing === "string" && existing.length > 0
			? existing
			: randomUUID();

	req.correlationId = correlationId;
	res.setHeader(CORRELATION_ID_HEADER, correlationId);

	next();
}
