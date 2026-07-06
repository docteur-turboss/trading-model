import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import {
	AddressManagerError,
	AgentError,
	AppError,
	AuthenticationError,
	DeadLetterError,
	MessageManagerError,
	ServiceNotFoundError,
	ServiceUnreachableError,
} from "../utils/errors";
import {
	ClassResponseExceptions,
	type ResponseObject,
} from "./response-exception";

type ErrorInput = Error | ResponseObject;

function mapErrorToResponse(err: Error): ResponseObject {
	const response = new ClassResponseExceptions(err.message);

	if (err instanceof ServiceNotFoundError) {
		return response.notFound();
	}
	if (err instanceof ServiceUnreachableError) {
		return response.gone();
	}
	if (err instanceof AuthenticationError) {
		return response.invalidToken();
	}
	if (
		err instanceof AddressManagerError ||
		err instanceof MessageManagerError ||
		err instanceof DeadLetterError ||
		err instanceof AgentError
	) {
		return response.serviceUnavailable();
	}

	return response.unknownError();
}

function logServerError(
	err: ErrorInput,
	req: Request,
	response: ResponseObject
): void {
	if (response.status >= 500) {
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
