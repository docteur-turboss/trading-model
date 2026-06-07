import { NextFunction, Request, Response } from 'express';

import { ClassResponseExceptions, ResponseObject } from './response-exception';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

type ErrorInput = Error | ResponseObject;

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
        return response.NotFound();
      case ErrorCodes.SERVICE_UNREACHABLE:
        return response.Gone();
      case ErrorCodes.AUTHENTICATION_ERROR:
        return response.InvalidToken();
      default:
        if (
          err.code === ErrorCodes.ADDRESS_MANAGER_ERROR ||
          err.code.startsWith('ADDRESS_MANAGER_')
        ) {
          return response.UnknownError();
        }
        break;
    }
  }

  return response.UnknownError();
}

/**
 * Log server-side errors (HTTP 5xx) with request context.
 *
 * Separated from the response middleware to isolate the logging concern.
 */
function logServerError(err: ErrorInput, req: Request, response: ResponseObject): void {
  if (response.status >= 500) {
    const originalError = err instanceof Error ? err : undefined;
    logger.error('Server error', {
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
 * app.use(ResponseProtocole);
 */
export const ResponseProtocole = (
  err: ErrorInput,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const response = err instanceof Error ? mapErrorToResponse(err) : err;

  logServerError(err, req, response);

  res.status(response.status).type('json').send(response.data);
  next();
};
