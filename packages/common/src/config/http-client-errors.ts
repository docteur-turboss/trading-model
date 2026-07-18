import type { ErrorResponse } from "@trading-model/validation/contracts/error-response";
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
	const err = createAppError(message, {
		code: ErrorCode.HttpClient,
	}) as unknown as HttpClientError;
	err.name = "HttpClientError";
	err.statusCode = statusCode;
	return err;
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
	const err = createAppError(message, {
		code: ErrorCode.HttpClientTimeout,
	}) as unknown as HttpClientTimeoutError;
	err.name = "HttpClientTimeoutError";
	err.timeoutMs = timeoutMs;
	return err;
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
