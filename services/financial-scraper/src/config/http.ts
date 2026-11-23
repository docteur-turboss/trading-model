import { computeExponentialBackoffWithJitter } from "@trading-model/common/utils/backoff-config";
import { isRetryableStatusPermissive } from "@trading-model/http/http-retry";
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
};

/** Total time one request may spend retrying, below the 60 s scrape cycle so a slow cycle never makes the next tick skip. */
const RETRY_DEADLINE_MS = 45_000;

type RetryConfig = AxiosRequestConfig & {
	retryCount?: number;
	deadline?: number;
};

/** Backoff wait that ends early when `signal` fires. */
function _sleepUnlessAborted(
	ms: number,
	signal?: AxiosRequestConfig["signal"]
): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref();
		signal?.addEventListener?.(
			"abort",
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
}

function _attachRetryInterceptor(instance: AxiosInstance): void {
	instance.interceptors.request.use((config) => {
		(config as RetryConfig).deadline ??= Date.now() + RETRY_DEADLINE_MS;
		return config;
	});
	instance.interceptors.response.use(undefined, (error: AxiosError) => {
		const config = error.config as RetryConfig | undefined;
		if (!config) {
			throw error;
		}
		if (config.signal?.aborted) {
			throw error;
		}
		config.retryCount = config.retryCount ?? 0;
		// A 429 is not retried here: the Binance source quarantine pauses every call until Retry-After.
		const retryable =
			!error.response ||
			(error.response.status !== 429 &&
				isRetryableStatusPermissive(error.response.status));
		if (config.retryCount >= RETRY_CONFIG.retries || !retryable) {
			throw error;
		}
		const delay = computeExponentialBackoffWithJitter(
			config.retryCount + 1,
			RETRY_CONFIG
		);
		// the next attempt may run a full timeout: it must end before the deadline
		if (
			Date.now() + delay + DEFAULT_TIMEOUT >
			(config.deadline ?? Number.POSITIVE_INFINITY)
		) {
			throw error;
		}
		config.retryCount++;
		return _sleepUnlessAborted(delay, config.signal).then(() => {
			if (config.signal?.aborted) {
				throw error;
			}
			return instance(config);
		});
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
		await acquireToken(
			baseURL,
			config.weight ?? 1,
			config.signal as AbortSignal | undefined
		);
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
