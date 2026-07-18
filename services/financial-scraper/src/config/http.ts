import { isRetryableStatusPermissive } from "@trading-model/common/config/http-retry";
import {
	DataSource,
	DurationMs,
} from "@trading-model/common/domain/primitives";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import axios, {
	type AxiosError,
	type AxiosInstance,
	type AxiosRequestConfig,
} from "axios";

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

	return instance;
}

function _attachRateLimiter(instance: AxiosInstance, baseURL: string): void {
	instance.interceptors.request.use(async (config) => {
		await acquireToken(baseURL, config.weight ?? 1);
		return config;
	});
}

/** Pre-built HTTP clients for supported data sources (e.g. Binance). */
export const httpClients: Record<DataSource, AxiosInstance> = {
	[DataSource.Binance]: createHttpClient("https://api.binance.com"),
};
