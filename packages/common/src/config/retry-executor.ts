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

export function shouldRetry(error: Error): boolean {
	if (error instanceof HttpClientTimeoutError) {
		return true;
	}
	if (
		error instanceof HttpClientError &&
		error.statusCode &&
		isRetryableStatus(error.statusCode)
	) {
		return true;
	}
	if (
		error.message.includes("ECONNRESET") ||
		error.message.includes("ETIMEDOUT") ||
		error.message.includes("ECONNREFUSED")
	) {
		return true;
	}
	return false;
}
