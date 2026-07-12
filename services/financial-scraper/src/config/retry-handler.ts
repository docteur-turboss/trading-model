import { isRetryableStatusPermissive } from "@trading-model/common/config/http-retry";
import { DurationMs } from "@trading-model/common/domain/primitives";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";

const RETRY_CONFIG = {
	retries: 5,
	baseDelayMs: DurationMs.of(300),
	maxDelayMs: DurationMs.of(10000),
};

function shouldRetry(error: AxiosError): boolean {
	if (!error.response) {
		return true;
	}
	return isRetryableStatusPermissive(error.response.status);
}

function getBackoffDelay(attempt: number): number {
	return computeExponentialBackoff(attempt, RETRY_CONFIG);
}

function retryLimitReached(
	config: AxiosRequestConfig & { retryCount?: number }
): boolean {
	return config.retryCount! >= RETRY_CONFIG.retries;
}

function executeRetry(
	instance: AxiosInstance,
	config: AxiosRequestConfig & { retryCount?: number }
): Promise<unknown> {
	config.retryCount!++;
	const delay = getBackoffDelay(config.retryCount!);
	return new Promise((res) => setTimeout(res, delay)).then(() =>
		instance(config)
	);
}

export function createRetryInterceptor(
	instance: AxiosInstance
): Parameters<AxiosInstance["interceptors"]["response"]["use"]>[1] {
	return (error: AxiosError) => {
		const config = error.config as AxiosRequestConfig & { retryCount?: number };
		if (!config) {
			throw error;
		}
		config.retryCount = config.retryCount ?? 0;
		if (retryLimitReached(config) || !shouldRetry(error)) {
			throw error;
		}
		return executeRetry(instance, config);
	};
}

export function attachRetryInterceptor(instance: AxiosInstance): void {
	instance.interceptors.response.use(
		(response) => response,
		createRetryInterceptor(instance)
	);
}
