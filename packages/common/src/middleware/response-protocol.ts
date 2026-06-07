import { NextFunction, Request, Response } from 'express';

import { ClassResponseExceptions, ResponseObject } from './response-exception';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

type ErrorInput = Error | ResponseObject;

/**
 * Maps domain / technical errors to standardized HTTP responses.
 *
 * This function acts as the single translation layer between
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
 * Global Express error-handling middleware.
 *
 * This middleware standardizes all outgoing JSON error responses and logs
 * critical server-side errors (HTTP 5xx) for monitoring and debugging purposes.
 *
 * Features:
 *  - Converts unstructured errors into a consistent JSON format using
 *    `ClassResponseExceptions`.
 *  - Logs server errors (status >= 500) with full stack trace and request context.
 *  - Sends the standardized response to the client with the correct HTTP status.
 *
 * @param err - The error caught in the request pipeline, either an instance
 *              of `Error` or a pre-formatted response object.
 * @param req - Express request object, used for logging request details.
 * @param res - Express response object, used to send the final standardized response.
 * @param next - Express next function; included for middleware compliance.
 *
 * @returns The standardized JSON error response sent to the client.
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
  let response: ResponseObject;
  let originalError: Error | undefined;

  /**
   * Case 1:
   * Error already formatted as a response object
   */
  if (!(err instanceof Error)) {
    response = err;
  } else {
    /**
     * Case 2:
     * Standard Error → mapped via domain translation
     */
    originalError = err;
    response = mapErrorToResponse(err);
  }

  /**
   * Log only server-side errors (5xx)
   */
  if (response.status >= 500) {
    logger.error('Server error', {
      message: originalError?.message,
      stack: originalError?.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  }

  res.status(response.status).type('json').send(response.data);
  next();
};
