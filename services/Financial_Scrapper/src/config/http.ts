import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosError,
  InternalAxiosRequestConfig,
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
type RateLimitBucket = {
  capacity: number;
  tokens: number;
  refillRate: number; // tokens per second
  lastRefill: number;
};

const rateLimitBuckets: Record<string, RateLimitBucket> = {};

/* -------------------------------------------------------
 * RATE LIMITER (PER BASEURL)
 * ----------------------------------------------------- */

function getRateLimitBucket(baseURL: string): RateLimitBucket {
  if (!rateLimitBuckets[baseURL]) {
    // Default: safe values. Can be overridden per API later.
    rateLimitBuckets[baseURL] = {
      capacity: 1200,
      tokens: 1200,
      refillRate: 20,
      lastRefill: Date.now(),
    };
  }
  return rateLimitBuckets[baseURL];
}

async function acquireToken(baseURL: string, weight = 1): Promise<void> {
  const bucket = getRateLimitBucket(baseURL);

  while (true) {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;

    // refill
    bucket.tokens = Math.min(
      bucket.capacity,
      bucket.tokens + elapsed * bucket.refillRate
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= weight) {
      bucket.tokens -= weight;
      return;
    }

    const waitMs = 50;
    await new Promise((res) => setTimeout(res, waitMs));
  }
}

  /* -------------------------------------------------------
  * RETRY LOGIC (WITH BINANCE ERROR HANDLING)
  * ----------------------------------------------------- */

  function shouldRetry(error: AxiosError): boolean {
    if (!error.response) return true; // network error → retry

    const status = error.response.status;

    if (status >= 500) return true;
    if ([403, 408, 429, 418].includes(status)) return true;

    return false;
  }

  function getBackoffDelay(attempt: number): number {
    const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, RETRY_CONFIG.maxDelayMs);
  }

/* -------------------------------------------------------
 * AXIOS INSTANCE FACTORY
 * ----------------------------------------------------- */

export function createHttpClient(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT,
  });

  /* -----------------------------------------
   * REQUEST INTERCEPTOR
   * --------------------------------------- */
  instance.interceptors.request.use(
    async (config) => {
      const weight = config.weight ?? 1;
      await acquireToken(baseURL, weight);

      return config;
    }
  );

  /* -----------------------------------------
   * RESPONSE / ERROR INTERCEPTOR (RETRY)
   * --------------------------------------- */
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as AxiosRequestConfig & { __retryCount?: number };

      if (!config) throw error;

      config.__retryCount = config.__retryCount ?? 0;

      if (config.__retryCount >= RETRY_CONFIG.retries || !shouldRetry(error)) {
        throw error;
      }

      config.__retryCount++;

      const delay = getBackoffDelay(config.__retryCount);
      await new Promise((res) => setTimeout(res, delay));

      return instance(config);
    }
  );

  return instance;
}

/* -------------------------------------------------------
 * PRE-BUILT CLIENTS (CAN ADD MORE LATER)
 * ----------------------------------------------------- */

export const httpClients = {
  binance: createHttpClient("https://api.binance.com"),
  // otherApi: createHttpClient("https://example.com/api"),
};
