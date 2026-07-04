import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import { AppError, type ErrorCode, ErrorCodes } from "../utils/errors";
import {
	ClassResponseExceptions,
	type ResponseObject,
} from "./response-exception";

type ErrorInput = Error | ResponseObject;

const SERVICE_UNAVAILABLE_CODES: ReadonlySet<ErrorCode> = new Set([
	ErrorCodes.ADDRESS_MANAGER_ERROR,
	ErrorCodes.MESSAGE_MANAGER_ERROR,
	ErrorCodes.DEAD_LETTER_ERROR,
	ErrorCodes.AGENT_ERROR,
]);

const IS_SERVICE_UNAVAILABLE = (code: ErrorCode): boolean =>
	SERVICE_UNAVAILABLE_CODES.has(code);

/**
 * Maps domain / technical errors to standardized HTTP responses.
 *
 * Acts as the single translation layer between
 * internal error types and external HTTP representations.
 */
function mapErrorToResponse(err: Error): ResponseObject {
	const response = new ClassResponseExceptions(err.message);

	if (err instanceof AppError) {
		switch (err.code) {
			case ErrorCodes.SERVICE_NOT_FOUND:
				return response.notFound();
			case ErrorCodes.SERVICE_UNREACHABLE:
				return response.gone();
			case ErrorCodes.AUTHENTICATION_ERROR:
				return response.invalidToken();
			default:
				if (IS_SERVICE_UNAVAILABLE(err.code)) {
					return response.serviceUnavailable();
				}
				break;
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
