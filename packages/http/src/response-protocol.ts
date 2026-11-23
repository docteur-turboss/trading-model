import { isAppError } from "@trading-model/common/utils/errors";
import {
	HTTP_STATUS,
	type HttpStatusCode,
} from "@trading-model/contracts/http-status";
import type { NextFunction, Request, Response } from "express";
import { logger } from "./logger";
import type { ResponseObject } from "./response-exception";

type ErrorInput = Error | ResponseObject;

/** Body of an error nobody anticipated: its message stays in the logs. */
const UNEXPECTED_ERROR = "Internal server error";

/** body-parser (http-errors) flags a client mistake with `expose` and a 4xx `status`. */
function isClientBodyError(err: Error): err is Error & { status: number } {
	const { status, expose } = err as { status?: unknown; expose?: unknown };
	return (
		expose === true &&
		typeof status === "number" &&
		status >= 400 &&
		status < 500
	);
}

function mapErrorToResponse(err: Error): ResponseObject {
	if (isAppError(err)) {
		return { status: err.httpStatus as HttpStatusCode, data: err.message };
	}
	if (isClientBodyError(err)) {
		// generic text: the parser message can echo part of the body
		return {
			status: err.status as HttpStatusCode,
			data:
				err.status === 413 ? "Request body too large" : "Invalid request body",
		};
	}
	return { status: HTTP_STATUS.INTERNAL_SERVER_ERROR, data: UNEXPECTED_ERROR };
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
	if (response.status === HTTP_STATUS.NOT_FOUND || response.status < 400) {
		return;
	}
	const serverError = response.status >= 500;
	const originalError = err instanceof Error ? err : undefined;
	const context = {
		// a body-parser message can echo the body: warn lines only get an AppError's
		message:
			serverError || isAppError(err) ? originalError?.message : undefined,
		correlationId: req.correlationId,
		// path only: the query string may carry secrets
		url: req.originalUrl.split("?")[0],
		method: req.method,
		status: response.status,
	};
	if (serverError) {
		logger.error("Server error", {
			context: { ...context, stack: originalError?.stack },
		});
	} else {
		logger.warn("Client error", { context });
	}
}

/** Maps an error to the HTTP response sent to the client. */
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
