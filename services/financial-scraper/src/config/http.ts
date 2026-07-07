import { DataSource } from "@trading-model/common/domain/primitives";
import { isRetryableStatusPermissive } from "@trading-model/common/config/http-retry";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import axios, {
	type AxiosError,
	type AxiosInstance,
	type AxiosRequestConfig,
} from "axios";

const DEFAULT_TIMEOUT = 7000;

const RETRY_CONFIG = {
	retries: 5,
	baseDelayMs: 300,
	maxDelayMs: 10000,
};

interface RateLimitBucket {
	capacity: number;
	tokens: number;
	/** Tokens added per second. */
	refillRate: number;
	lastRefill: number;
}

const RATE_LIMIT_BUCKETS: Record<string, RateLimitBucket> = {};

function getRateLimitBucket(baseURL: string): RateLimitBucket {
	if (!RATE_LIMIT_BUCKETS[baseURL]) {
		RATE_LIMIT_BUCKETS[baseURL] = {
			capacity: 1200,
			tokens: 1200,
			refillRate: 20,
			lastRefill: Date.now(),
		};
	}
	return RATE_LIMIT_BUCKETS[baseURL];
}

async function acquireToken(baseURL: string, weight: number): Promise<void> {
	const bucket = getRateLimitBucket(baseURL);

	while (true) {
		_refillBucket(bucket);
		if (bucket.tokens >= weight) {
			bucket.tokens -= weight;
			return;
		}
		await _sleep(50);
	}
}

function _refillBucket(bucket: RateLimitBucket): void {
	const now = Date.now();
	const elapsed = (now - bucket.lastRefill) / 1000;
	bucket.tokens = Math.min(
		bucket.capacity,
		bucket.tokens + elapsed * bucket.refillRate
	);
	bucket.lastRefill = now;
}

function shouldRetry(error: AxiosError): boolean {
	if (!error.response) {
		return true;
	}

	return isRetryableStatusPermissive(error.response.status);
}

function getBackoffDelay(attempt: number): number {
	return computeExponentialBackoff(attempt, {
		baseDelayMs: RETRY_CONFIG.baseDelayMs,
		maxDelayMs: RETRY_CONFIG.maxDelayMs,
	});
}

function createRetryInterceptor(
	instance: AxiosInstance
): Parameters<AxiosInstance["interceptors"]["response"]["use"]>[1] {
	return async (error: AxiosError) => {
		const config = error.config as AxiosRequestConfig & { retryCount?: number };
		if (!config) {
			throw error;
		}
		config.retryCount = config.retryCount ?? 0;
		if (_retryLimitReached(config) || !shouldRetry(error)) {
			throw error;
		}
		return _executeRetry(instance, config);
	};
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
	const delay = getBackoffDelay(config.retryCount!);
	return new Promise((res) => setTimeout(res, delay)).then(() =>
		instance(config)
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

function _attachRetryInterceptor(instance: AxiosInstance): void {
	instance.interceptors.response.use(
		(response) => response,
		createRetryInterceptor(instance)
	);
}

/** Pre-built HTTP clients for supported data sources (e.g. Binance). */
export const httpClients: Record<DataSource, AxiosInstance> = {
	[DataSource.Binance]: createHttpClient("https://api.binance.com"),
};
