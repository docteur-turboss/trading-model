import { anonymizeIp } from "@trading-model/common/utils/anonymize-ip";
import { isAppError } from "@trading-model/common/utils/errors";
import {
	HTTP_STATUS,
	type HttpStatusCode,
} from "@trading-model/contracts/http-status";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../../application/services/logger";
import type { ResponseObject } from "./response-exception";

type ErrorInput = Error | ResponseObject;

/** Body of an error nobody anticipated: its message stays in the logs. */
const UNEXPECTED_ERROR = "Internal server error";

function mapErrorToResponse(err: Error): ResponseObject {
	return isAppError(err)
		? { status: err.httpStatus as HttpStatusCode, data: err.message }
		: { status: HTTP_STATUS.INTERNAL_SERVER_ERROR, data: UNEXPECTED_ERROR };
}

/**
 * The JSON body of an error (`ErrorResponse`, ADR-0021). A string reason used
 * to be sent as is under a JSON content type: not JSON at all.
 */
function errorBody(data: unknown): unknown {
	return typeof data === "string" ? { error: data } : data;
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
			ip: anonymizeIp(req.ip),
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

	res.status(response.status).json(errorBody(response.data));
};
