import https from 'https';
import http from 'http';
import crypto from 'crypto';

export interface FetchResult {
  status: number;
  body: string;
}

export function fetchUrl(
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    timeout?: number;
  }
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    const bodyData = options?.body ? JSON.stringify(options.body) : undefined;

    const req = lib.request(
      url,
      {
        method: options?.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
          ...(bodyData ? { 'Content-Length': Buffer.byteLength(bodyData).toString() } : {}),
        },
        rejectUnauthorized: false,
        timeout: options?.timeout || 10000,
      },
      res => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );

    req.on('error', (err: Error) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${options?.timeout || 10000}ms`));
    });

    if (bodyData) req.write(bodyData);
    req.end();
  });
}

export function computeDlqSignature(
  serviceName: string,
  secret: string,
  body: unknown,
  timestamp: string,
  method: string,
  path: string
): string {
  const bodyHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const payload = `${serviceName}:${timestamp}:${bodyHash}:${method}:${path}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export const PORTS = {
  discovery: 8443,
  message: 8444,
  scraper: 8445,
  trainer: 8446,
  ca: 8447,
  gateway: 8448,
  admin: 8449,
  audit: 8450,
  dlq: 8452,
} as const;

export const e2eTestTimeout = 30000;
