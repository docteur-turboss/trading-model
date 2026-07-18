import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import { HTTP_STATUS, type HttpStatusCode } from "../http-status";
import { isAppError } from "../utils/errors";
import type { ResponseObject } from "./response-exception";

type ErrorInput = Error | ResponseObject;

function mapErrorToResponse(err: Error): ResponseObject {
	const httpStatus = isAppError(err)
		? (err.httpStatus as HttpStatusCode)
		: HTTP_STATUS.INTERNAL_SERVER_ERROR;
	return { status: httpStatus, data: err.message };
}

function logServerError(
	err: ErrorInput,
	req: Request,
	response: ResponseObject
): void {
	if (response.status < 500) {
		return;
	}
	const originalError = err instanceof Error ? err : undefined;
	logger.error("Server error", {
		context: {
			message: originalError?.message,
			stack: originalError?.stack,
			url: req.originalUrl,
			method: req.method,
			ip: req.ip,
		},
	});
}

export const ResponseProtocol = (
	err: ErrorInput,
	req: Request,
	res: Response,
	_next: NextFunction
) => {
	const response = err instanceof Error ? mapErrorToResponse(err) : err;

	logServerError(err, req, response);

	res.status(response.status).type("json").send(response.data);
};
