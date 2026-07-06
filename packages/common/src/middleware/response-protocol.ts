import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import {
	isAddressManagerError,
	isAgentError,
	isAuthenticationError,
	isDeadLetterError,
	isMessageManagerError,
	isServiceNotFoundError,
	isServiceUnreachableError,
} from "../utils/errors";
import {
	ClassResponseExceptions,
	type ResponseObject,
} from "./response-exception";

type ErrorInput = Error | ResponseObject;

function _isServiceError(err: Error): boolean {
	return (
		isAddressManagerError(err) ||
		isMessageManagerError(err) ||
		isDeadLetterError(err) ||
		isAgentError(err)
	);
}

function mapErrorToResponse(err: Error): ResponseObject {
	const response = new ClassResponseExceptions(err.message);
	if (isServiceNotFoundError(err)) {
		return response.notFound();
	}
	if (isServiceUnreachableError(err)) {
		return response.gone();
	}
	if (isAuthenticationError(err)) {
		return response.invalidToken();
	}
	if (_isServiceError(err)) {
		return response.serviceUnavailable();
	}
	return response.unknownError();
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
