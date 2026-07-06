import type { TlsPemBundle } from "../domain/tls-paths";
import { sleep } from "../utils/sleep";
import type { RequestContext, ServiceRoute } from "./http-request-executor";
import type { HttpRequestOptions } from "./http-types";
import {
	checkHostnameCircuit,
	checkServiceCircuit,
	recordHostnameFailure,
	recordHostnameSuccess,
	recordServiceFailure,
	recordServiceSuccess,
} from "./http-circuit-breaker";
import { HttpClientError, HttpClientTimeoutError } from "./http-client-errors";
import {
	computeRetryDelay,
	DEFAULT_RETRY_COUNT,
	isRetryableStatus,
} from "./http-retry";

export class RetryCircuitHandler {
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
				this.recordSuccess(route.hostname, route.serviceName);
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < retryCount && this.shouldRetry(lastError)) {
					await sleep(computeRetryDelay(attempt));
					continue;
				}

				this.recordFailure(
					route.hostname,
					route.serviceName,
					context.options?.serviceInstanceCount
				);
				throw lastError;
			}
		}

		throw lastError ?? new Error("Request failed");
	}

	checkPreconditions(
		urlStr: string,
		options?: HttpRequestOptions
	): ServiceRoute {
		const hostname = new URL(urlStr).hostname;
		const serviceName = options?.serviceName;
		checkHostnameCircuit(hostname);
		if (serviceName) {
			checkServiceCircuit(serviceName);
		}
		return { hostname, serviceName };
	}

	shouldRetry(error: Error): boolean {
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

	recordSuccess(hostname: string, serviceName: string | undefined): void {
		recordHostnameSuccess(hostname);
		if (serviceName) {
			recordServiceSuccess(serviceName);
		}
	}

	recordFailure(
		hostname: string,
		serviceName: string | undefined,
		serviceInstanceCount?: number
	): void {
		recordHostnameFailure(hostname);
		if (serviceName) {
			recordServiceFailure(serviceName, serviceInstanceCount);
		}
	}
}
