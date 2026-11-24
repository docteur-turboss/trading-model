import { createAppError, ErrorCode } from "@trading-model/common/utils/errors";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";

/** Error raised by the HTTP client, with the status code when there is one. */
export type HttpClientError = Error & {
	readonly name: "HttpClientError";
	readonly code: typeof ErrorCode.HttpClient;
	readonly statusCode?: HttpStatusCode;
	readonly cause?: unknown;
	readonly reason?: string;
};

/** Error raised when an HTTP call exceeds its timeout. */
export type HttpClientTimeoutError = Error & {
	readonly name: "HttpClientTimeoutError";
	readonly code: typeof ErrorCode.HttpClientTimeout;
	readonly timeoutMs: number;
	readonly cause?: unknown;
	readonly reason?: string;
};

// The error name is its code: "HttpClientError", "HttpClientTimeoutError".
function _create<TError>(
	code: typeof ErrorCode.HttpClient | typeof ErrorCode.HttpClientTimeout,
	message: string,
	fields: object
): TError {
	// as unknown as: Error subclass assembled with Object.assign
	return Object.assign(createAppError(message, { code }), {
		name: code,
		...fields,
	}) as unknown as TError;
}

function _hasName(err: unknown, name: string): boolean {
	return (
		typeof err === "object" && err !== null && (err as Error).name === name
	);
}

/** Builds an HttpClientError with an optional HTTP status code. */
export function createHttpClientError(
	message: string,
	statusCode?: HttpStatusCode
): HttpClientError {
	return _create(ErrorCode.HttpClient, message, { statusCode });
}

/** Type guard for HttpClientError. */
export function isHttpClientError(err: unknown): err is HttpClientError {
	return _hasName(err, ErrorCode.HttpClient);
}

/** Builds an HttpClientTimeoutError for the given timeout. */
export function createHttpClientTimeoutError(
	message: string,
	timeoutMs: number
): HttpClientTimeoutError {
	return _create(ErrorCode.HttpClientTimeout, message, { timeoutMs });
}

/** Type guard for HttpClientTimeoutError. */
export function isHttpClientTimeoutError(
	err: unknown
): err is HttpClientTimeoutError {
	return _hasName(err, ErrorCode.HttpClientTimeout);
}
