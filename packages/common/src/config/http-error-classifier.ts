import {
	isHttpClientError,
	isHttpClientTimeoutError,
} from "./http-client-errors";
import { isRetryableStatus } from "./http-retry";

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
