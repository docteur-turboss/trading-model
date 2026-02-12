import { ClassResponseExceptions } from "./responseException";
import { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import {
  AuthenticationError,
  ServiceNotFoundError,
  ServiceUnreachableError,
  AddressManagerBaseError,
} from "../utils/Errors";

type ResponseObject = {
  status: number;
  data: string;
};
type ErrorInput = Error | ResponseObject;

/**
 * Maps domain / technical errors to standardized HTTP responses.
 *
 * This function acts as the single translation layer between
 * internal error types and external HTTP representations.
 */
function mapErrorToResponse(err: Error): ResponseObject {
  const response = new ClassResponseExceptions(err.message);

  /**
   * Address Manager / Service Discovery errors
   */
  if (err instanceof ServiceNotFoundError) {
    return response.NotFound();
  }

  if (err instanceof ServiceUnreachableError) {
    // Service exists but is temporarily unavailable
    return response.Gone(); // 410
  }

  if (err instanceof AuthenticationError) {
    return response.InvalidToken(); // 498
  }

  /**
   * Known module-level errors without explicit mapping
   */
  if (err instanceof AddressManagerBaseError) {
    return response.UnknownError();
  }

  /**
   * Fallback for any untyped or unexpected error
   */
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
    logger.error("Server error", {
      message: originalError?.message,
      stack: originalError?.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  }

  return res.status(response.status).json(response.data) as unknown as void;
  /**
   * Note: `next()` after sending a response is necessary for Express to understand it as an error handler; it cannot be removed.
   */
  next();
};