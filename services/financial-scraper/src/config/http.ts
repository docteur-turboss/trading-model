import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import { isRetryableStatusPermissive } from "@trading-model/http/infrastructure/http-retry";
import { DataSource, DurationMs } from "@trading-model/primitives/primitives";
import axios, {
	type AxiosError,
	type AxiosInstance,
	type AxiosRequestConfig,
} from "axios";

import {
	BINANCE_REQUEST_DURATION_SECONDS,
	BINANCE_REQUESTS_TOTAL,
} from "./metrics";
import { acquireToken } from "./rate-limiter";

const DEFAULT_TIMEOUT = 7000;

const RETRY_CONFIG = {
	retries: 5,
	baseDelayMs: DurationMs.of(300),
	maxDelayMs: DurationMs.of(10000),
};

function _shouldRetry(error: AxiosError): boolean {
	if (!error.response) {
		return true;
	}
	return isRetryableStatusPermissive(error.response.status);
}

function _getBackoffDelay(attempt: number): number {
	return computeExponentialBackoff(attempt, RETRY_CONFIG);
}

function _retryLimitReached(
	config: AxiosRequestConfig & { retryCount?: number }
): boolean {
	return config.retryCount! >= RETRY_CONFIG.retries;
}

function _executeRetry(
	instance: AxiosInstance,
	config: AxiosRequestConfig & { retryCount?: number }
): Promise<unknown> {
	config.retryCount!++;
	const delay = _getBackoffDelay(config.retryCount!);
	return new Promise((res) => setTimeout(res, delay)).then(() =>
		instance(config)
	);
}

function _createRetryInterceptor(
	instance: AxiosInstance
): Parameters<AxiosInstance["interceptors"]["response"]["use"]>[1] {
	return (error: AxiosError) => {
		const config = error.config as AxiosRequestConfig & { retryCount?: number };
		if (!config) {
			throw error;
		}
		config.retryCount = config.retryCount ?? 0;
		if (_retryLimitReached(config) || !_shouldRetry(error)) {
			throw error;
		}
		return _executeRetry(instance, config);
	};
}

function _attachRetryInterceptor(instance: AxiosInstance): void {
	instance.interceptors.response.use(
		(response) => response,
		_createRetryInterceptor(instance)
	);
}

/** Create a configured Axios instance with rate-limiting and retry logic for the given API base URL. */
export function createHttpClient(baseURL: string): AxiosInstance {
	const instance = axios.create({
		baseURL,
		timeout: DEFAULT_TIMEOUT,
	});

	_attachRateLimiter(instance, baseURL);
	_attachRetryInterceptor(instance);
	_attachMetricsInterceptor(instance);

	return instance;
}

function _attachRateLimiter(instance: AxiosInstance, baseURL: string): void {
	instance.interceptors.request.use(async (config) => {
		await acquireToken(baseURL, config.weight ?? 1);
		return config;
	});
}

function _attachMetricsInterceptor(instance: AxiosInstance): void {
	if (process.env.NODE_ENV === "test") {
		return;
	}
	const startTimes = new WeakMap<AxiosRequestConfig, number>();
	instance.interceptors.request.use((config) => {
		startTimes.set(config, performance.now());
		return config;
	});
	instance.interceptors.response.use(
		(response) => {
			const start = startTimes.get(response.config);
			if (start !== undefined) {
				const endpoint = _extractEndpoint(response.config.url ?? "");
				const duration = (performance.now() - start) / 1000;
				BINANCE_REQUESTS_TOTAL.inc({
					endpoint,
					status: String(response.status),
				});
				BINANCE_REQUEST_DURATION_SECONDS.observe({ endpoint }, duration);
			}
			return response;
		},
		(error: AxiosError) => {
			const start = error.config ? startTimes.get(error.config) : undefined;
			if (start !== undefined) {
				const endpoint = _extractEndpoint(error.config?.url ?? "");
				const duration = (performance.now() - start) / 1000;
				const status = error.response?.status ?? "network_error";
				BINANCE_REQUESTS_TOTAL.inc({
					endpoint,
					status: String(status),
				});
				BINANCE_REQUEST_DURATION_SECONDS.observe({ endpoint }, duration);
			}
			throw error;
		}
	);
}

function _extractEndpoint(url: string): string {
	const match = url.match(/\/api\/v3\/(\w+)/);
	return match?.[1] ?? "unknown";
}

/** Pre-built HTTP clients for supported data sources (e.g. Binance). */
export const httpClients: Record<DataSource, AxiosInstance> = {
	[DataSource.Binance]: createHttpClient("https://api.binance.com"),
};
