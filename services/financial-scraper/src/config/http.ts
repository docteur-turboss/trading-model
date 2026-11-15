import { computeExponentialBackoffWithJitter } from "@trading-model/common/utils/backoff-config";
import { sleep } from "@trading-model/common/utils/sleep";
import {
	isRetryableStatusPermissive,
	RETRY_JITTER_MS,
} from "@trading-model/http/http-retry";
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

type RetryConfig = AxiosRequestConfig & { retryCount?: number };

function _attachRetryInterceptor(instance: AxiosInstance): void {
	instance.interceptors.response.use(undefined, (error: AxiosError) => {
		const config = error.config as RetryConfig | undefined;
		if (!config) {
			throw error;
		}
		config.retryCount = config.retryCount ?? 0;
		const retryable =
			!error.response || isRetryableStatusPermissive(error.response.status);
		const retryAfterMs = _retryAfterMs(error);
		if (
			config.retryCount >= RETRY_CONFIG.retries ||
			!retryable ||
			retryAfterMs > RETRY_AFTER_MAX_MS
		) {
			throw error;
		}
		config.retryCount++;
		const delay = Math.max(
			computeExponentialBackoffWithJitter(config.retryCount, RETRY_CONFIG),
			retryAfterMs
		);
		return sleep(delay).then(() => instance(config));
	});
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
	const record = (
		config: AxiosRequestConfig | undefined,
		status: number | string
	): void => {
		const start = config ? startTimes.get(config) : undefined;
		if (start === undefined) {
			return;
		}
		const endpoint = _extractEndpoint(config?.url ?? "");
		BINANCE_REQUESTS_TOTAL.inc({ endpoint, status: String(status) });
		BINANCE_REQUEST_DURATION_SECONDS.observe(
			{ endpoint },
			(performance.now() - start) / 1000
		);
	};
	instance.interceptors.response.use(
		(response) => {
			record(response.config, response.status);
			return response;
		},
		(error: AxiosError) => {
			record(error.config, error.response?.status ?? "network_error");
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
