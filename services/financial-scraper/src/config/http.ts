import axios, {
	type AxiosError,
	type AxiosInstance,
	type AxiosRequestConfig,
} from "axios";

/* -------------------------------------------------------
 * CONFIG GLOBAL
 * ----------------------------------------------------- */

const DEFAULT_TIMEOUT = 7000;

// Retry strategy
const RETRY_CONFIG = {
	retries: 5,
	baseDelayMs: 300,
	maxDelayMs: 10000,
};

// Rate limit per API baseURL (token bucket)
interface RateLimitBucket {
	capacity: number;
	tokens: number;
	refillRate: number; // tokens per second
	lastRefill: number;
}

const RATE_LIMIT_BUCKETS: Record<string, RateLimitBucket> = {};

/* -------------------------------------------------------
 * RATE LIMITER (PER BASEURL)
 * ----------------------------------------------------- */

function getRateLimitBucket(baseURL: string): RateLimitBucket {
	if (!RATE_LIMIT_BUCKETS[baseURL]) {
		// Default: safe values. Can be overridden per API later.
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

/* -------------------------------------------------------
 * RETRY LOGIC (WITH BINANCE ERROR HANDLING)
 * ----------------------------------------------------- */

function shouldRetry(error: AxiosError): boolean {
	if (!error.response) {
		return true; // network error → retry
	}

	const status = error.response.status;

	if (status >= 500) {
		return true;
	}
	if ([403, 408, 429, 418].includes(status)) {
		return true;
	}

	return false;
}

function getBackoffDelay(attempt: number): number {
	return RETRY_CONFIG.baseDelayMs * 2 ** attempt;
}

/* -------------------------------------------------------
 * AXIOS INSTANCE FACTORY
 * ----------------------------------------------------- */

function createRetryInterceptor(
	instance: AxiosInstance
): Parameters<AxiosInstance["interceptors"]["response"]["use"]>[1] {
	return async (error: AxiosError) => {
		const config = _getRetryConfig(error);
		if (!config) {
			throw error;
		}
		if (_shouldSkipRetry(config)) {
			throw error;
		}
		return _executeRetry(instance, config);
	};
}

function _getRetryConfig(
	error: AxiosError
): (AxiosRequestConfig & { retryCount?: number }) | null {
	const config = error.config as AxiosRequestConfig & { retryCount?: number } | undefined;
	return config ?? null;
}

function _shouldSkipRetry(
	config: AxiosRequestConfig & { retryCount?: number }
): boolean {
	config.retryCount = config.retryCount ?? 0;
	return config.retryCount >= RETRY_CONFIG.retries || !shouldRetry(config.retryCount, config);
}

function _executeRetry(
	instance: AxiosInstance,
	config: AxiosRequestConfig & { retryCount?: number }
): Promise<unknown> {
	config.retryCount!++;
	const delay = getBackoffDelay(config.retryCount!);
	return new Promise((res) => setTimeout(res, delay)).then(() => instance(config));
}

/** Create a configured Axios instance with rate-limiting and retry logic for the given API base URL. */
export function createHttpClient(baseURL: string): AxiosInstance {
	const instance = axios.create({
		baseURL,
		timeout: DEFAULT_TIMEOUT,
	});

	instance.interceptors.request.use(async (config) => {
		await acquireToken(baseURL, config.weight ?? 1);
		return config;
	});

	instance.interceptors.response.use(
		(response) => response,
		createRetryInterceptor(instance)
	);

	return instance;
}

/* -------------------------------------------------------
 * PRE-BUILT CLIENTS (CAN ADD MORE LATER)
 * ----------------------------------------------------- */

/** Pre-built HTTP clients for supported data sources (e.g. Binance). */
export const httpClients = {
	binance: createHttpClient("https://api.binance.com"),
	// otherApi: createHttpClient("https://example.com/api"),
};
