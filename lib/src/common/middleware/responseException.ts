/**
 * Centralized list of all custom response types used throughout the application,
 * each paired with its corresponding HTTP status code.
 *
 * This array acts as the single source of truth for:
 *  - Mapping logical response names (e.g., "BadRequest", "Unauthorized")
 *    to their HTTP status values.
 *  - Generating type-safe objects (`HTTP_CODE`, `ResponseCodes`)
 *    used by the response exception system.
 *
 * By keeping all response definitions in one place, we ensure consistency,
 * reduce duplication, and make it easy to extend the response model.
 */
const httpResponseDefinitions = [
  { key: "ServiceUnavailable", code: 503 },
  { key: "UnknownError", code: 500 },
  { key: "InvalidToken", code: 498 },
  { key: "TooManyRequests", code: 429 },
  { key: "IMATeapot", code: 418 },
  { key: "PayloadTooLarge", code: 413 },
  { key: "Gone", code: 410 },
  { key: "Conflict", code: 409 },
  { key: "MethodNotAllowed", code: 405 },
  { key: "NotFound", code: 404 },
  { key: "Forbidden", code: 403 },
  { key: "PaymentRequired", code: 402 },
  { key: "Unauthorized", code: 401 },
  { key: "BadRequest", code: 400 },
  { key: "OK", code: 201 },
  { key: "Success", code: 200 },
] as const;

/**
 * Maps each response definition key to itself, producing a strongly typed
 * enumeration-like object of HTTP response identifiers.
 *
 * This structure is used to standardize the set of available response codes
 * throughout the application.  
 *
 * Example:
 * HTTP_CODE.BadRequest === "BadRequest"
 * HTTP_CODE.NotFound === "NotFound"
 *
 * The resulting object is fully type-safe thanks to `as const` typing on the
 * original definition list.
 */
export const HTTP_CODE = Object.fromEntries(
  httpResponseDefinitions.map(({ key }) => [key, key])
) as { [K in typeof httpResponseDefinitions[number]["key"]]: K };

/**
 * A lookup table mapping each response key to its associated numeric
 * HTTP status code. This provides a type-safe and centralized way to
 * access all supported HTTP codes throughout the application.
 *
 * The resulting object is strongly typed so that only keys defined in
 * `httpResponseDefinitions` are allowed, preventing invalid status
 * references at compile time.
 *
 * @example
 * ResponseCodes.BadRequest   // → 400
 * ResponseCodes.NotFound     // → 404
 * ResponseCodes.Success      // → 200
 */
export const ResponseCodes = Object.fromEntries(
  httpResponseDefinitions.map(({ key, code }) => [key, code])
) as { [K in typeof httpResponseDefinitions[number]["key"]]: number };

/**
 * Type representing the set of all valid response code keys.
 * Each key corresponds to a named HTTP response in `ResponseCodes`.
 *
 * Example:
 * type MyKey = "Success" | "BadRequest" | "NotFound" | ... ;
 */
export type ResponseCodeKey = keyof typeof ResponseCodes;

/**
 * Type representing the numeric HTTP status code associated with a given key.
 *
 * Example:
 * type MyValue = 200 | 201 | 400 | 401 | 404 | 500 | ... ;
 */
export type ResponseCodeValue = typeof ResponseCodes[ResponseCodeKey];

/**
 * ClassResponseExceptions is a structured wrapper for creating standardized
 * API responses based on predefined HTTP status codes.
 *
 * It extends the built-in `Error` class to store a `reason` message and
 * provides a method for each response type defined in `ResponseCodes`.
 * Each method returns an object containing the HTTP status and the reason,
 * suitable for sending as a JSON response to clients.
 *
 * Example usage:
 * const response = ResponseException("Invalid token").Unauthorized();
 * // returns: { status: 401, data: "Invalid token" }
 */
export class ClassResponseExceptions extends Error {
  /** The reason or message describing the response/error */
  reason: string;

  /**
   * Creates a new instance of ClassResponseExceptions.
   * @param reason - The error or response message, can be any type.
   *                 Non-string values are automatically stringified.
   */
  constructor(reason: unknown) {
    super()
    this.reason = typeof reason === "string" ? reason : JSON.stringify(reason);
  }

  ServiceUnavailable() {
    return { status: ResponseCodes.ServiceUnavailable, data: this.reason }
  }

  /** Returns a 500 Unknown Error response object */
  UnknownError() {
    return { status: ResponseCodes.UnknownError, data: this.reason };
  }

  /** Returns a 498 Invalid Token response object */
  InvalidToken() {
    return { status: ResponseCodes.InvalidToken, data: this.reason };
  }

  /** Returns a 429 Too Many Requests response object */
  TooManyRequests() {
    return { status: ResponseCodes.TooManyRequests, data: this.reason };
  }

  /** Returns a 418 I'm a Teapot response object */
  IMATeapot() {
    return { status: ResponseCodes.IMATeapot, data: this.reason };
  }

  /** Returns a 413 Payload Too Large response object */
  PayloadTooLarge() {
    return { status: ResponseCodes.PayloadTooLarge, data: this.reason };
  }

  /** Returns a 410 Gone response object */
  Gone() {
    return { status: ResponseCodes.Gone, data: this.reason };
  }

  /** Returns a 409 Conflict response object */
  Conflict() {
    return { status: ResponseCodes.Conflict, data: this.reason };
  }

  /** Returns a 404 Not Found response object */
  NotFound() {
    return { status: ResponseCodes.NotFound, data: this.reason };
  }

  /** Returns a 405 Method Not Allowed response object */
  MethodNotAllowed() {
    return { status: ResponseCodes.MethodNotAllowed, data: this.reason };
  }

  /** Returns a 403 Forbidden response object */
  Forbidden() {
    return { status: ResponseCodes.Forbidden, data: this.reason };
  }

  /** Returns a 402 Payment Required response object */
  PaymentRequired() {
    return { status: ResponseCodes.PaymentRequired, data: this.reason };
  }

  /** Returns a 401 Unauthorized response object */
  Unauthorized() {
    return { status: ResponseCodes.Unauthorized, data: this.reason };
  }

  /** Returns a 400 Bad Request response object */
  BadRequest() {
    return { status: ResponseCodes.BadRequest, data: this.reason };
  }

  /** Returns a 201 OK response object */
  OK() {
    return { status: ResponseCodes.OK, data: this.reason };
  }

  /** Returns a 200 Success response object */
  Success() {
    return { status: ResponseCodes.Success, data: this.reason };
  }
}

/**
 * Factory function to create a new instance of ClassResponseExceptions.
 *
 * This provides a convenient way to generate standardized response objects
 * for any reason or error, without needing to instantiate the class manually.
 *
 * @param reason - Optional message or error payload to include in the response.
 *                 If not a string, it will be stringified internally.
 * @returns A new ClassResponseExceptions instance initialized with the provided reason.
 *
 * @example
 * const response = ResponseException("Invalid token").Unauthorized();
 * // returns: { status: 401, data: "Invalid token" }
 */
export const ResponseException = (reason: unknown = "") =>
  new ClassResponseExceptions(reason);