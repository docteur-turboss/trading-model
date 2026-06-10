import https from 'node:https';

import { Request, Response } from 'express';

import { logger } from '@trading-model/common/config/logger';

import { env } from '../config/env';
import { ResolvedTarget } from './service-resolver';

export interface ProxyResult {
  status: number;
  body: string;
  headers: Record<string, string | string[]>;
}

export function forwardRequest(
  req: Request,
  target: ResolvedTarget,
  path: string,
  timeoutMs: number = env.PROXY_TIMEOUT_MS,
): Promise<ProxyResult> {
  return new Promise((resolve, reject) => {
    const safeHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (
        lower === 'x-api-key'
        || lower === 'authorization'
        || lower === 'host'
        || lower === 'connection'
        || lower === 'keep-alive'
      ) {
        continue;
      }
      if (typeof value === 'string') {
        safeHeaders[key] = value;
      } else if (Array.isArray(value)) {
        safeHeaders[key] = value.join(', ');
      }
    }

    safeHeaders['x-forwarded-for'] = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    safeHeaders['x-forwarded-proto'] = 'https';
    safeHeaders['x-request-id'] = (req.headers['x-request-id'] as string) ?? crypto.randomUUID();

    const url = new URL(path, `https://${target.host}:${target.port}`);

    const options: https.RequestOptions = {
      hostname: target.host,
      port: target.port,
      path: url.pathname + url.search,
      method: req.method,
      headers: safeHeaders,
      rejectUnauthorized: true,
      timeout: timeoutMs,
    };

    const proxyReq = https.request(options, proxyRes => {
      const chunks: Buffer[] = [];

      proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: proxyRes.statusCode ?? 503,
          body,
          headers: proxyRes.headers as Record<string, string | string[]>,
        });
      });
    });

    proxyReq.on('error', err => {
      logger.error('Proxy request failed', {
        target: `${target.host}:${target.port}`,
        path,
        error: err.message,
      });
      reject(err);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      reject(new Error(`Proxy timeout after ${timeoutMs}ms`));
    });

    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      const bodyStr = JSON.stringify(req.body);
      proxyReq.write(bodyStr);
    }

    proxyReq.end();
  });
}
