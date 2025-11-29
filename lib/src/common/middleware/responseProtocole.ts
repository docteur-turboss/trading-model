import { ClassResponseExceptions } from "./responseException";
import { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";

type responseObj = {
    status: number;
    data: string;
}

type errType = Error | responseObj;

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
  err: errType,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let originalError;

  let errResponse;
  if (err instanceof Error) {
    // Convert untyped errors into a standardized response
    originalError = err;
    errResponse = new ClassResponseExceptions("").UnknownError();
  } else {
    errResponse = err;
  }

  // Log only critical server errors
  if (errResponse.status >= 500) {
    logger.error("Server Error", {
      message: originalError?.message,
      stack: originalError?.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip
    });
  }

  // Send the standardized response to the client
  return res.status(errResponse.status).json(errResponse.data);

  // Note: `next()` after sending a response is necessary for Express to understand it as an error handler; it cannot be removed.
  next();
};