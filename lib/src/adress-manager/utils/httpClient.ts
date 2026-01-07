import https from "https";
import { URL } from "url";

/**
 * HttpClient
 *
 * Centralized abstraction for all outgoing HTTP calls within the module.
 */
export class HttpClient {
  private readonly ca?: string;
  private readonly cert?: string;
  private readonly key?: string;

  constructor(tlsConfig?: { ca?: string; cert?: string; key?: string }) {
    this.ca = tlsConfig?.ca;
    this.cert = tlsConfig?.cert;
    this.key = tlsConfig?.key;
  }

  async get<T = void>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>("GET", url, undefined, options);
  }

  async post<T = void>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>("POST", url, body, options);
  }

  private async request<T>(
    method: HttpMethod,
    urlStr: string,
    body?: unknown,
    options?: HttpRequestOptions
  ): Promise<T> {
    const url = new URL(urlStr);

    const requestOptions: https.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
      cert: this.cert,
      key: this.key,
      ca: this.ca,
      rejectUnauthorized: true,
    };

    return new Promise<T>((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = "";

        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            return reject(new HttpClientError(`HTTP ${res.statusCode} on ${method} ${urlStr}`, res.statusCode));
          }

          if (res.statusCode === 204) return resolve(undefined as T);

          const contentType = res.headers["content-type"] || "";

          try {
            if (contentType.includes("application/json")) {
              resolve(JSON.parse(data) as T);
            } else {
              resolve(data as unknown as T);
            }
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on("error", (err) => reject(err));

      if (options?.timeoutMs) {
        req.setTimeout(options.timeoutMs, () => {
          req.destroy();
          reject(new HttpClientTimeoutError(`Request timed out after ${options.timeoutMs}ms`, options.timeoutMs??10000));
        });
      }

      if (body) req.write(JSON.stringify(body));

      req.end();
    });
  }
}

type HttpMethod = "GET" | "POST";

export interface HttpRequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class HttpClientError extends Error {
  public readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "HttpClientError";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class HttpClientTimeoutError extends Error {
  public readonly timeoutMs: number;
  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "HttpClientTimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}