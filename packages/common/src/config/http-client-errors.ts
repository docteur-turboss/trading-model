import type { ErrorResponse } from "../contracts/error-response";
import type { HttpStatusCode } from "../http-status";
import { createAppError, ErrorCode } from "../utils/errors";

export interface HttpClientErrorData {
	readonly name: "HttpClientError";
	readonly message: string;
	readonly code: typeof ErrorCode.HttpClient;
	readonly statusCode?: HttpStatusCode;
	readonly cause?: unknown;
	readonly reason?: string;
}

export type HttpClientError = Error & HttpClientErrorData;

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
	) as unknown as HttpClientError;
}

export function isHttpClientError(err: unknown): err is HttpClientError {
	return (
		typeof err === "object" &&
		err !== null &&
		(err as HttpClientError).name === "HttpClientError"
	);
}

export function toHttpClientErrorResponse(err: HttpClientError): ErrorResponse {
	return {
		code: err.code,
		message: err.message,
		statusCode: err.statusCode,
	};
}

export interface HttpClientTimeoutErrorData {
	readonly name: "HttpClientTimeoutError";
	readonly message: string;
	readonly code: typeof ErrorCode.HttpClientTimeout;
	readonly timeoutMs: number;
	readonly cause?: unknown;
	readonly reason?: string;
}

export type HttpClientTimeoutError = Error & HttpClientTimeoutErrorData;

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
	) as unknown as HttpClientTimeoutError;
}

export function isHttpClientTimeoutError(
	err: unknown
): err is HttpClientTimeoutError {
	return (
		typeof err === "object" &&
		err !== null &&
		(err as HttpClientTimeoutError).name === "HttpClientTimeoutError"
	);
}
