import type { TlsPemBundle } from "../domain/tls-paths";
import { sleep } from "../utils/sleep";
import {
	HttpClientError,
	HttpClientTimeoutError,
} from "./http-client-errors";
import type { RequestContext } from "./http-request-executor";
import {
	computeRetryDelay,
	DEFAULT_RETRY_COUNT,
	isRetryableStatus,
} from "./http-retry";
import { CircuitRecorder, type ServiceRoute } from "./circuit-recorder";

export class RetryExecutor {
	private readonly _circuitRecorder: CircuitRecorder;

	constructor(circuitRecorder: CircuitRecorder) {
		this._circuitRecorder = circuitRecorder;
	}

	async executeWithRetry<TResponse>(
		context: RequestContext<TResponse>,
		execute: (
			ctx: RequestContext<TResponse>,
			tls?: Partial<TlsPemBundle>
		) => Promise<TResponse | undefined>,
		route: ServiceRoute,
		tls?: Partial<TlsPemBundle>
	): Promise<TResponse | undefined> {
		const retryCount = context.options?.retryCount ?? DEFAULT_RETRY_COUNT;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const result = await execute(context, tls);
				this._circuitRecorder.recordSuccess(route.hostname, route.serviceName);
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < retryCount && shouldRetry(lastError)) {
					await sleep(computeRetryDelay(attempt));
					continue;
				}

				this._circuitRecorder.recordFailure(
					route.hostname,
					route.serviceName,
					context.options?.serviceInstanceCount
				);
				throw lastError;
			}
		}

		throw lastError ?? new Error("Request failed");
	}
}

function _isSocketError(error: Error): boolean {
	return (
		error.message.includes("ECONNRESET") ||
		error.message.includes("ETIMEDOUT") ||
		error.message.includes("ECONNREFUSED")
	);
}

export function shouldRetry(error: Error): boolean {
	if (error instanceof HttpClientTimeoutError) {
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

function _isRetryableHttpError(error: Error): boolean {
	return (
		error instanceof HttpClientError &&
		error.statusCode !== undefined &&
		isRetryableStatus(error.statusCode)
	);
}
