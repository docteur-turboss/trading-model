import { createHmac } from 'node:crypto';

import { HttpClient, HttpRequestOptions } from '@trading-model/common/config/http-client';
import { deterministicStringify } from '@trading-model/common/utils/deterministic-stringify';
import { AppError, ErrorCodes, normalizeError } from '@trading-model/common/utils/errors';

import { DlqEntry } from './dlq-repository';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { messagesDlqErrorTotal } from '../../config/metrics';

function getHmacSecretBuffer(): Buffer {
  const raw = env.DLQ_AUTH_HMAC_SECRET ?? '';
  return Buffer.from(raw, 'utf-8');
}

function normalizeBody(body: unknown): unknown {
  if (typeof body === 'object' && body !== null) {
    return { ...(body as Record<string, unknown>) };
  }
  return body ?? {};
}

function signRequest(
  serviceName: string,
  method: string,
  path: string,
  body: unknown,
  secretBuf?: Buffer
): { timestamp: string; signature: string } {
  const timestamp = String(Date.now());
  const parts = [
    serviceName,
    timestamp,
    deterministicStringify(normalizeBody(body)),
    method,
    path,
  ].join(':');
  const buf = secretBuf ?? getHmacSecretBuffer();
  try {
    if (buf.length < 16) {
      logger.warn('DLQ HMAC secret is too short or empty — requests will not be signed');
      return { timestamp, signature: '' };
    }
    const signature = createHmac('sha256', buf).update(parts).digest('hex');
    return { timestamp, signature };
  } finally {
    buf.fill(0);
  }
}

function signedOptions(
  method: string,
  path: string,
  body: unknown,
  extra?: Partial<HttpRequestOptions>
): HttpRequestOptions {
  const opts: HttpRequestOptions & { headers: Record<string, string> } = {
    timeoutMs: 5000,
    ...extra,
    headers: { 'x-service-name': 'message-manager', ...(extra?.headers ?? {}) },
  };
  const secretBuf = getHmacSecretBuffer();
  if (secretBuf.length >= 16) {
    const { timestamp, signature } = signRequest('message-manager', method, path, body, secretBuf);
    opts.headers['x-timestamp'] = timestamp;
    opts.headers['x-signature'] = signature;
  }
  return opts;
}

export class DlqServiceClient {
  private httpClient: HttpClient;
  private serviceUrl: string;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.serviceUrl = env.DLQ_SERVICE_URL || '';
  }

  get isEnabled(): boolean {
    return !!this.serviceUrl;
  }

  async send(entry: DlqEntry, attempt = 1, MAX_RETRIES = 3): Promise<void> {
    if (!this.isEnabled) {
      logger.warn('DLQ Service not configured, dropping dead letter entry', {
        reason: entry.reason,
      });
      messagesDlqErrorTotal.inc({ target: 'not-configured' });
      return;
    }

    try {
      await this.httpClient.post(
        `${this.serviceUrl}/dlq`,
        entry,
        signedOptions('POST', '/dlq', entry, { timeoutMs: 5000 })
      );
      logger.info('DLQ entry sent to DLQ service', { reason: entry.reason });
    } catch (err) {
      if (attempt <= MAX_RETRIES) {
        const delay = Math.round(
          Math.min(200 * Math.pow(2, attempt - 1), 5000) * (0.5 + Math.random() * 0.5)
        );
        logger.warn('Retrying DLQ send after error', {
          attempt,
          delay,
          reason: entry.reason,
          error: normalizeError(err as Error),
        });
        await new Promise(r => setTimeout(r, delay));
        return this.send(entry, attempt + 1, MAX_RETRIES);
      }
      logger.error('Failed to send DLQ entry to service after retries', {
        error: normalizeError(err as Error),
        reason: entry.reason,
      });
      throw new AppError('Failed to send DLQ entry', ErrorCodes.MESSAGE_MANAGER_ERROR, {
        cause: err,
      });
    }
  }

  async replay(topic?: string, limit = 100): Promise<DlqEntry[]> {
    if (!this.isEnabled) return [];

    try {
      const params = new URLSearchParams();
      if (topic) params.set('topic', topic);
      params.set('limit', limit.toString());
      const result = await this.httpClient.get<{ entries: DlqEntry[] }>(
        `${this.serviceUrl}/dlq?${params.toString()}`,
        signedOptions('GET', '/dlq', undefined, { timeoutMs: 5000 })
      );
      return result?.entries ?? [];
    } catch (err) {
      logger.error('Failed to fetch DLQ entries for replay', {
        error: normalizeError(err as Error),
      });
      return [];
    }
  }

  async delete(entryIds: string[]): Promise<void> {
    if (!this.isEnabled) return;

    const body = { ids: entryIds };

    try {
      await this.httpClient.post(
        `${this.serviceUrl}/dlq/delete`,
        body,
        signedOptions('POST', '/dlq/delete', body, { timeoutMs: 5000 })
      );
    } catch (err) {
      logger.error('Failed to delete DLQ entries', {
        error: normalizeError(err as Error),
      });
    }
  }
}
