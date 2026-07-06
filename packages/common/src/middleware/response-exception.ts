/**
 * Centralized list of all custom response types used throughout the application,
 * each paired with its corresponding HTTP status code.
 *
 * This array acts as the single source of truth for:
 *  - Mapping logical response names (e.g., "badRequest", "unauthorized")
 *    to their HTTP status values.
 *  - Generating type-safe objects (`HTTP_CODE`, `ResponseCodes`)
 *    used by the response exception system.
 *
 * By keeping all response definitions in one place, we ensure consistency,
 * reduce duplication, and make it easy to extend the response model.
 */
const HTTP_RESPONSE_DEFINITIONS = [
	{ key: "serviceUnavailable", code: 503 },
	{ key: "unknownError", code: 500 },
	{ key: "invalidToken", code: 498 },
	{ key: "tooManyRequests", code: 429 },
	{ key: "imaTeapot", code: 418 },
	{ key: "payloadTooLarge", code: 413 },
	{ key: "gone", code: 410 },
	{ key: "conflict", code: 409 },
	{ key: "methodNotAllowed", code: 405 },
	{ key: "notFound", code: 404 },
	{ key: "forbidden", code: 403 },
	{ key: "paymentRequired", code: 402 },
	{ key: "unauthorized", code: 401 },
	{ key: "badRequest", code: 400 },
	{ key: "noContent", code: 204 },
	{ key: "ok", code: 201 },
	{ key: "success", code: 200 },
] as const;

/**
 * Maps each response definition key to itself, producing a strongly typed
 * enumeration-like object of HTTP response identifiers.
 *
 * This structure is used to standardize the set of available response codes
 * throughout the application.
 *
 * Example:
 * HTTP_CODE.badRequest === "badRequest"
 * HTTP_CODE.notFound === "notFound"
 *
 * The resulting object is fully type-safe thanks to `as const` typing on the
 * original definition list.
 */
export const HTTP_CODE = Object.fromEntries(
	HTTP_RESPONSE_DEFINITIONS.map(({ key }) => [key, key])
) as { [TKey in (typeof HTTP_RESPONSE_DEFINITIONS)[number]["key"]]: TKey };

export const ResponseCodes = Object.fromEntries(
	HTTP_RESPONSE_DEFINITIONS.map(({ key, code }) => [key, code])
) as { [TKey in (typeof HTTP_RESPONSE_DEFINITIONS)[number]["key"]]: number };

/**
 * Type representing the set of all valid response code keys.
 * Each key corresponds to a named HTTP response in `ResponseCodes`.
 *
 * Example:
 * type MyKey = "success" | "badRequest" | "notFound" | ... ;
 */
export type ResponseCodeKey = keyof typeof ResponseCodes;

/**
 * Type representing the numeric HTTP status code associated with a given key.
 *
 * Example:
 * type MyValue = 200 | 201 | 400 | 401 | 404 | 500 | ... ;
 */
export type ResponseCodeValue = (typeof ResponseCodes)[ResponseCodeKey];

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
 * const response = ResponseException("Invalid token").unauthorized();
 * // returns: { status: 401, data: "Invalid token" }
 */
export class ClassResponseExceptions extends Error {
	readonly reason: string;

	constructor(reason: unknown) {
		super();
		this.name = "ClassResponseExceptions";
		this.reason = typeof reason === "string" ? reason : JSON.stringify(reason);
	}

	serviceUnavailable() {
		return { status: ResponseCodes.serviceUnavailable, data: this.reason };
	}

	unknownError() {
		return { status: ResponseCodes.unknownError, data: this.reason };
	}

	invalidToken() {
		return { status: ResponseCodes.invalidToken, data: this.reason };
	}

	tooManyRequests() {
		return { status: ResponseCodes.tooManyRequests, data: this.reason };
	}

	imaTeapot() {
		return { status: ResponseCodes.imaTeapot, data: this.reason };
	}

	payloadTooLarge() {
		return { status: ResponseCodes.payloadTooLarge, data: this.reason };
	}

	gone() {
		return { status: ResponseCodes.gone, data: this.reason };
	}

	conflict() {
		return { status: ResponseCodes.conflict, data: this.reason };
	}

	notFound() {
		return { status: ResponseCodes.notFound, data: this.reason };
	}

	methodNotAllowed() {
		return { status: ResponseCodes.methodNotAllowed, data: this.reason };
	}

	forbidden() {
		return { status: ResponseCodes.forbidden, data: this.reason };
	}

	paymentRequired() {
		return { status: ResponseCodes.paymentRequired, data: this.reason };
	}

	unauthorized() {
		return { status: ResponseCodes.unauthorized, data: this.reason };
	}

	badRequest() {
		return { status: ResponseCodes.badRequest, data: this.reason };
	}

	noContent() {
		return { status: ResponseCodes.noContent, data: undefined };
	}

	ok() {
		return { status: ResponseCodes.ok, data: this.reason };
	}

	success() {
		return { status: ResponseCodes.success, data: this.reason };
	}
}

/**
 * Response object type returned by all response helpers.
 */
export interface ResponseObject {
	status: number;
	data: unknown;
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
 * const response = ResponseException("Invalid token").unauthorized();
 * // returns: { status: 401, data: "Invalid token" }
 */
export const ResponseException = (reason: unknown = "") =>
	new ClassResponseExceptions(reason);

/**
 * Create a response object without throwing an exception.
 * Use this in controllers instead of `throw ResponseException(...).Method()`.
 *
 * @param data - Response payload (JSON-serializable).
 * @param status - HTTP status code.
 * @returns A response object compatible with catchSync.
 */
export const sendResponse = (
	data: unknown,
	status: number
): ResponseObject => ({
	status,
	data,
});
