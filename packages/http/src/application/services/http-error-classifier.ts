import {
	isHttpClientError,
	isHttpClientTimeoutError,
} from "../../adapters/outbound/http-client-errors";
import { isRetryableStatus } from "../../infrastructure/http-retry";

/** Tells whether a failed outbound call is worth retrying. */
export function shouldRetry(error: Error): boolean {
	if (isHttpClientTimeoutError(error)) {
		return true;
	}
	if (_isRetryableHttpError(error)) {
		return true;
	}
	if (_isSocketError(error)) {
		return true;
	}
	return false;
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
		error.message.includes("ECONNREFUSED")
	);
}

function _isRetryableHttpError(error: Error): boolean {
	return (
		isHttpClientError(error) &&
		error.statusCode !== undefined &&
		isRetryableStatus(error.statusCode)
	);
}
