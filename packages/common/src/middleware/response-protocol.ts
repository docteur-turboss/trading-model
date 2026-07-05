import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import { AppError, type ErrorCode, ErrorCodes } from "../utils/errors";
import {
	ClassResponseExceptions,
	type ResponseObject,
} from "./response-exception";

type ErrorInput = Error | ResponseObject;

type ErrorMapper = (response: ClassResponseExceptions) => ResponseObject;

const ERROR_RESPONSE_MAP: Partial<Record<ErrorCode, ErrorMapper>> = {
	[ErrorCodes.SERVICE_NOT_FOUND]: (r) => r.notFound(),
	[ErrorCodes.SERVICE_UNREACHABLE]: (r) => r.gone(),
	[ErrorCodes.AUTHENTICATION_ERROR]: (r) => r.invalidToken(),
	[ErrorCodes.ADDRESS_MANAGER_ERROR]: (r) => r.serviceUnavailable(),
	[ErrorCodes.MESSAGE_MANAGER_ERROR]: (r) => r.serviceUnavailable(),
	[ErrorCodes.DEAD_LETTER_ERROR]: (r) => r.serviceUnavailable(),
	[ErrorCodes.AGENT_ERROR]: (r) => r.serviceUnavailable(),
};

/**
 * Maps domain / technical errors to standardized HTTP responses.
 *
 * Acts as the single translation layer between
 * internal error types and external HTTP representations.
 */
function mapErrorToResponse(err: Error): ResponseObject {
	const response = new ClassResponseExceptions(err.message);

	if (err instanceof AppError) {
		const mapper = ERROR_RESPONSE_MAP[err.code];
		if (mapper) {
			return mapper(response);
		}
	}

	return response.unknownError();
}

/**
 * Log server-side errors (HTTP 5xx) with request context.
 *
 * Separated from the response middleware to isolate the logging concern.
 */
function logServerError(
	err: ErrorInput,
	req: Request,
	response: ResponseObject
): void {
	if (response.status >= 500) {
		const originalError = err instanceof Error ? err : undefined;
		logger.error("Server error", {
			message: originalError?.message,
			stack: originalError?.stack,
			url: req.originalUrl,
			method: req.method,
			ip: req.ip,
		});
	}
}

/**
 * Global Express error-handling middleware.
 *
 * Composes three concerns:
 *  1. Error mapping (`mapErrorToResponse`) — domain → HTTP response
 *  2. Server error logging (`logServerError`) — 5xx monitoring
 *  3. Response sending — standardized JSON output
 *
 * @param err - The error caught in the request pipeline.
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function.
 *
 * @example
 * app.use(ResponseProtocol);
 */
export const ResponseProtocol = (
	err: ErrorInput,
	req: Request,
	res: Response,
	_next: NextFunction // kept for Express error middleware arity detection
) => {
	const response = err instanceof Error ? mapErrorToResponse(err) : err;

	logServerError(err, req, response);

	res.status(response.status).type("json").send(response.data);
};
