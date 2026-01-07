/**
 * HttpClient
 *
 * Centralized abstraction for all outgoing HTTP calls within the module.
 *
 * Responsibilities:
 * - Provide a simple, strongly-typed API for HTTP requests.
 * - Handle request timeouts.
 * - Normalize network errors.
 *
 * Constraints:
 * - No business logic.
 * - No knowledge of Address Manager specifics.
 * - No implicit retries.
 */
export class HttpClient {
  /**
   * Performs an HTTP GET request.
   *
   * @template T - Expected type of the response body.
   * @param url - Target URL.
   * @param options - Optional request configuration (timeout, headers).
   * @returns Parsed response of type T.
   *
   * @example
   * ```ts
   * const data = await httpClient.get<{ token: string }>('https://api.example.com/token');
   * ```
   */
  async get<T = void>(
    url: string,
    options?: HttpRequestOptions
  ): Promise<T> {
    return this.request<T>("GET", url, undefined, options);
  }

  /**
   * Performs an HTTP POST request.
   *
   * @template T - Expected type of the response body.
   * @param url - Target URL.
   * @param body - Optional request payload.
   * @param options - Optional request configuration (timeout, headers).
   * @returns Parsed response of type T.
   *
   * @example
   * ```ts
   * const response = await httpClient.post<{ token: string }>(
   *   'https://api.example.com/token/rotate',
   *   { instanceId: '123', serviceName: 'my-service' }
   * );
   * ```
   */
  async post<T = void>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions
  ): Promise<T> {
    return this.request<T>("POST", url, body, options);
  }

  /**
   * Core HTTP request handler.
   *
   * Contains all technical logic: JSON parsing, timeouts, error normalization.
   * This method should not be called directly; use `get` or `post`.
   *
   * @private
   */
  private async request<T>(
    method: HttpMethod,
    url: string,
    body?: unknown,
    options?: HttpRequestOptions
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? 0;

    let timeoutId: NodeJS.Timeout | undefined;

    if (timeoutMs) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(options?.headers ?? {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HttpClientError(
          `HTTP ${response.status} on ${method} ${url}`,
          response.status
        );
      }

      if (response.status === 204) {
        // No content
        return undefined as T;
      }

      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        return (await response.json()) as T;
      }

      return (await response.text()) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new HttpClientTimeoutError(
          `Request timed out after ${timeoutMs}ms`,
          timeoutMs
        );
      }

      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * Supported HTTP methods.
 */
type HttpMethod = "GET" | "POST";

/**
 * Options available for HttpClient requests.
 */
export interface HttpRequestOptions {
  /**
   * Request timeout in milliseconds.
   */
  timeoutMs?: number;

  /**
   * Additional HTTP headers.
   */
  headers?: Record<string, string>;
}

/**
 * Generic HTTP client error.
 *
 * Use this to distinguish network/technical failures from business errors.
 */
export class HttpClientError extends Error {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "HttpClientError";
    this.statusCode = statusCode;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an HTTP request exceeds the specified timeout.
 */
export class HttpClientTimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "HttpClientTimeoutError";
    this.timeoutMs = timeoutMs;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}