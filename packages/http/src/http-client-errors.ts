import { createAppError, ErrorCode } from "@trading-model/common/utils/errors";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";

/** Fields of an error raised by the HTTP client. */
export interface HttpClientErrorData {
	readonly name: "HttpClientError";
	readonly message: string;
	readonly code: typeof ErrorCode.HttpClient;
	readonly statusCode?: HttpStatusCode;
	readonly cause?: unknown;
	readonly reason?: string;
}

/** Error raised by the HTTP client, with the status code when there is one. */
export type HttpClientError = Error & HttpClientErrorData;

/** Builds an HttpClientError with an optional HTTP status code. */
export function createHttpClientError(
	message: string,
	statusCode?: HttpStatusCode
): HttpClientError {
	return Object.assign(
		createAppError(message, {
			code: ErrorCode.HttpClient,
		}),
		{
			name: "HttpClientError",
			statusCode,
		}
		// as unknown as: Error subclass assembled with Object.assign
	) as unknown as HttpClientError;
}

/** Type guard for HttpClientError. */
export function isHttpClientError(err: unknown): err is HttpClientError {
	return (
		typeof err === "object" &&
		err !== null &&
		(err as HttpClientError).name === "HttpClientError"
	);
}

/** Fields of an error raised when an HTTP call exceeds its timeout. */
export interface HttpClientTimeoutErrorData {
	readonly name: "HttpClientTimeoutError";
	readonly message: string;
	readonly code: typeof ErrorCode.HttpClientTimeout;
	readonly timeoutMs: number;
	readonly cause?: unknown;
	readonly reason?: string;
}

/** Error raised when an HTTP call exceeds its timeout. */
export type HttpClientTimeoutError = Error & HttpClientTimeoutErrorData;

/** Builds an HttpClientTimeoutError for the given timeout. */
export function createHttpClientTimeoutError(
	message: string,
	timeoutMs: number
): HttpClientTimeoutError {
	return Object.assign(
		createAppError(message, {
			code: ErrorCode.HttpClientTimeout,
		}),
		{
			name: "HttpClientTimeoutError",
			timeoutMs,
		}
		// as unknown as: Error subclass assembled with Object.assign
	) as unknown as HttpClientTimeoutError;
}

/** Type guard for HttpClientTimeoutError. */
export function isHttpClientTimeoutError(
	err: unknown
): err is HttpClientTimeoutError {
	return (
		typeof err === "object" &&
		err !== null &&
		(err as HttpClientTimeoutError).name === "HttpClientTimeoutError"
	);
}
