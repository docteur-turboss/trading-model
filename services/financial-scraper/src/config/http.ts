import { computeExponentialBackoffWithJitter } from "@trading-model/common/utils/backoff-config";
import { sleep } from "@trading-model/common/utils/sleep";
import {
	isRetryableStatusPermissive,
	RETRY_JITTER_MS,
} from "@trading-model/http/infrastructure/http-retry";
import { DataSource, DurationMs } from "@trading-model/primitives/primitives";
import axios, {
	type AxiosError,
	type AxiosInstance,
	type AxiosRequestConfig,
} from "axios";

import { ENV } from "../infrastructure/config/env";
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
	jitterMs: RETRY_JITTER_MS,
};

/** Longest Retry-After honoured: one scrape interval. Beyond it the error surfaces and the next cycle resumes. */
const RETRY_AFTER_MAX_MS = 60_000;

/** Retry-After of a 429, in ms. shortcut: seconds form only (the one Binance sends), HTTP dates are ignored. */
function _retryAfterMs(error: AxiosError): number {
	if (error.response?.status !== 429) {
		return 0;
	}
	const seconds = Number(error.response.headers?.["retry-after"]);
	return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

function _shouldRetry(error: AxiosError): boolean {
	if (!error.response) {
		return true;
	}
	return isRetryableStatusPermissive(error.response.status);
}

function _getBackoffDelay(attempt: number): number {
	return computeExponentialBackoffWithJitter(attempt, RETRY_CONFIG);
}

function _retryLimitReached(
	config: AxiosRequestConfig & { retryCount?: number }
): boolean {
	return config.retryCount! >= RETRY_CONFIG.retries;
}

function _executeRetry(
	instance: AxiosInstance,
	config: AxiosRequestConfig & { retryCount?: number },
	retryAfterMs: number
): Promise<unknown> {
	config.retryCount!++;
	const delay = Math.max(_getBackoffDelay(config.retryCount!), retryAfterMs);
	return sleep(delay).then(() => instance(config));
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
		const retryAfterMs = _retryAfterMs(error);
		if (retryAfterMs > RETRY_AFTER_MAX_MS) {
			throw error;
		}
		return _executeRetry(instance, config, retryAfterMs);
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
	[DataSource.Binance]: createHttpClient(ENV.BINANCE_BASE_URL),
};
