import { randomUUID } from "node:crypto";
import {
	type CorrelationId,
	toCorrelationId,
} from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
	interface Request {
		correlationId: CorrelationId;
	}
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

	next();
}
