import {
	isHttpClientError,
	isHttpClientTimeoutError,
} from "./http-client-errors";
import { isRetryableStatus } from "./http-retry";

/** Tells whether a failed outbound call is worth retrying. */
export function shouldRetry(error: Error): boolean {
	return (
		isHttpClientTimeoutError(error) ||
		_isRetryableHttpError(error) ||
		_isSocketError(error)
	);
}

/** The target answered with a non-retryable HTTP status (4xx except 429): it is up. */
export function isTargetAnswer(error: Error): boolean {
	return (
		isHttpClientError(error) &&
		error.statusCode !== undefined &&
		!shouldRetry(error)
	);
}

/** The connection was refused: the request was never sent. */
export function isConnectionRefused(error: Error): boolean {
	return error.message.includes("ECONNREFUSED");
}

function _isSocketError(error: Error): boolean {
	return (
		error.message.includes("ECONNRESET") ||
		error.message.includes("ETIMEDOUT") ||
		isConnectionRefused(error)
	);
}

function _isRetryableHttpError(error: Error): boolean {
	return (
		isHttpClientError(error) &&
		error.statusCode !== undefined &&
		isRetryableStatus(error.statusCode)
	);
}
