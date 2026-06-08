import https from 'https';
import fs from 'node:fs';
import { URL } from 'url';

import { z } from 'zod';

function readTlsFile(filePath: string, label: string): string {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const original = err instanceof Error ? err : new Error(String(err));
    original.message = `Failed to read TLS ${label} from "${filePath}": ${original.message}`;
    throw original;
  }
}

/**
 * HttpClient
 *
 * Centralized abstraction for all outgoing HTTP calls within the module.
 */
export class HttpClient {
  private readonly ca?: string;
  private readonly cert?: string;
  private readonly key?: string;

  /**
   * @param tlsConfig - Optional paths to TLS certificate files loaded at construction.
   */
  constructor(tlsConfig?: { ca?: string; cert?: string; key?: string }) {
    if (tlsConfig?.ca) this.ca = readTlsFile(tlsConfig.ca, 'CA certificate');
    if (tlsConfig?.cert) this.cert = readTlsFile(tlsConfig.cert, 'client certificate');
    if (tlsConfig?.key) this.key = readTlsFile(tlsConfig.key, 'client key');
  }

  /**
   * Sends a GET request and returns the parsed response.
   * Returns `undefined` for 204 No Content responses.
   */
  async get<T = void>(
    url: string,
    options?: HttpRequestOptions,
    schema?: z.ZodType<T>
  ): Promise<T | undefined> {
    return this.request<T>('GET', url, undefined, options, schema);
  }

  /**
   * Sends a POST request with an optional JSON body and returns the parsed response.
   * Returns `undefined` for 204 No Content responses.
   */
  async post<T = void>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
    schema?: z.ZodType<T>
  ): Promise<T | undefined> {
    return this.request<T>('POST', url, body, options, schema);
  }

  /**
   * Sends a DELETE request and returns the parsed response.
   * Returns `undefined` for 204 No Content responses.
   */
  async delete<T = void>(
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
    schema?: z.ZodType<T>
  ): Promise<T | undefined> {
    return this.request<T>('DELETE', url, body, options, schema);
  }

  /**
   * Creates an HttpClient configured with TLS certificates.
   *
   * Centralises the three-file mapping that was previously duplicated
   * across address-manager, broker-message, and message-manager.
   */
  static createWithTls(certPaths: TlsClientPaths): HttpClient {
    return new HttpClient({
      ca: certPaths.RootCACertPath,
      cert: certPaths.CertificatPath,
      key: certPaths.KeyCertificatPath,
    });
  }

  private async request<T>(
    method: HttpMethod,
    urlStr: string,
    body?: unknown,
    options?: HttpRequestOptions,
    schema?: z.ZodType<T>
  ): Promise<T | undefined> {
    const url = new URL(urlStr);

    const requestOptions: https.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
      cert: this.cert,
      key: this.key,
      ca: this.ca,
      rejectUnauthorized: true,
    };

    return new Promise<T | undefined>((resolve, reject) => {
      const req = https.request(requestOptions, res => {
        let data = '';

        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            return reject(
              new HttpClientError(`HTTP ${res.statusCode} on ${method} ${urlStr}`, res.statusCode)
            );
          }

          if (res.statusCode === 204) return resolve(undefined);

          const contentType = res.headers['content-type'] || '';

          try {
            if (contentType.startsWith('application/json')) {
              // JSON.parse returns any, which is directly assignable to T via as T
              const parsed: unknown = JSON.parse(data);
              resolve(schema ? schema.parse(parsed) : (parsed as T));
            } else {
              // non-JSON body (plain text) — must go through unknown because
              // string is not guaranteed assignable to generic T
              const parsed: unknown = data;
              resolve(schema ? schema.parse(parsed) : (parsed as T));
            }
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      });

      req.on('error', err => reject(err));

      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const onTimeout = () => {
        req.destroy();
        reject(new HttpClientTimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs));
      };
      req.setTimeout(timeoutMs, onTimeout);
      req.on('close', () => {
        if (req.destroyed) return;
        req.removeListener('timeout', onTimeout);
      });

      if (body) req.write(JSON.stringify(body));

      req.end();
    });
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;

type HttpMethod = 'GET' | 'POST' | 'DELETE';

/** Optional parameters for an HTTP request. */
export interface HttpRequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** Thrown when an HTTP response carries a non-2xx status code. */
export class HttpClientError extends Error {
  public readonly statusCode?: number;
  /**
   * @param message - Human-readable error description.
   * @param statusCode - The HTTP status code that caused the error.
   */
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'HttpClientError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Standard TLS certificate paths used by all services.
 */
export interface TlsClientPaths {
  RootCACertPath: string;
  CertificatPath: string;
  KeyCertificatPath: string;
}

/** Thrown when an HTTP request exceeds the configured timeout. */
export class HttpClientTimeoutError extends Error {
  public readonly timeoutMs: number;
  /**
   * @param message - Human-readable error description.
   * @param timeoutMs - The timeout duration in milliseconds.
   */
  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'HttpClientTimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
