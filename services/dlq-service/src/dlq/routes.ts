import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import RedisStore from 'rate-limit-redis';

import { deterministicStringify } from '@trading-model/common/utils/deterministic-stringify';

import { AddEntry, ListEntries, DeleteEntries, HealthCheck, ReadyCheck, ReplayEntries } from './controller';
import { env, resolveAuthHmacSecret } from '../config/env';
import { logger } from '../config/logger';
import { metricsHandler } from '../config/metrics';

const ALLOWED_SERVICES = env.DLQ_ALLOWED_SERVICES.split(',').map(s => s.trim()).filter(Boolean);

const activeRateLimiters: Array<{ resetKey: (key: string) => void }> = [];

function normalizeBody(body: unknown): unknown {
  return body ?? {};
}

function verifySignature(req: Request, serviceName: string): boolean {
  const secret = resolveAuthHmacSecret();

  const provided = (req.headers['x-signature'] as string) || '';
  const timestampStr = (req.headers['x-timestamp'] as string) || '';

  if (!timestampStr || !provided) return false;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > 300_000) return false;

  let bodyString: string;
  try {
    bodyString = deterministicStringify(normalizeBody(req.body));
  } catch {
    logger.warn('Failed to stringify request body for signature verification', { serviceName });
    return false;
  }

  const bodyHash = createHash('sha256').update(bodyString).digest('hex');

  const newParts = [serviceName, timestampStr, bodyHash, req.method, req.path].join(':');
  const expectedNew = createHmac('sha256', secret).update(newParts).digest('hex');
  if (provided.length === expectedNew.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expectedNew))) {
    return true;
  }

  const oldParts = [serviceName, timestampStr, bodyString, req.method, req.path].join(':');
  const expectedOld = createHmac('sha256', secret).update(oldParts).digest('hex');
  if (provided.length === expectedOld.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expectedOld))) {
    return true;
  }

  return false;
}

function serviceAuth(req: Request, res: Response, next: NextFunction): void {
  const serviceName = req.headers['x-service-name'] as string | undefined;
  if (!serviceName || !ALLOWED_SERVICES.includes(serviceName)) {
    res.status(403).json({ error: 'Unauthorized service' });
    return;
  }
  if (!verifySignature(req, serviceName)) {
    res.status(401).json({ error: 'Invalid or expired signature' });
    return;
  }
  next();
}

let sharedRedisClient: Redis | null = null;
let sharedRedisInit = false;

function getOrCreateRedis(): Redis | null {
  if (sharedRedisClient) return sharedRedisClient;
  if (sharedRedisInit) return null;
  sharedRedisInit = true;

  if (!env.REDIS_URL) return null;
  try {
    sharedRedisClient = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 200, 5_000);
        return delay;
      },
    });
    sharedRedisClient.connect().catch(() => {
      sharedRedisClient = null;
      sharedRedisInit = false;
    });
    return sharedRedisClient;
  } catch {
    return null;
  }
}

function createStore(): undefined | RedisStore {
  const client = getOrCreateRedis();
  if (!client) {
    logger.warn('Redis unavailable — rate limiting falls back to per-instance memory store');
    return undefined;
  }
  const sendCommand = (...args: string[]): Promise<number> => {
    return (client.call(args[0], ...args.slice(1)) as Promise<unknown>) as Promise<number>;
  };
  return new RedisStore({ sendCommand });
}

export async function closeRedisClient(): Promise<void> {
  if (sharedRedisClient) {
    try {
      await sharedRedisClient.quit();
    } catch {
      sharedRedisClient.disconnect();
    }
    sharedRedisClient = null;
  }
  sharedRedisInit = false;
}

export function closeRateLimiters(): void {
  activeRateLimiters.length = 0;
}

export const DlqRoutes = (): Router => {
  const router = Router();

  const replayLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore(),
    message: { error: 'Too many replay requests, try again later' },
  });

  const writeLimiter = rateLimit({
    windowMs: 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore(),
    message: { error: 'Too many DLQ write requests, try again later' },
  });

  const healthLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore(),
    message: { error: 'Too many health check requests' },
  });

  if (typeof replayLimiter === 'function' && 'resetKey' in replayLimiter) {
    activeRateLimiters.push(replayLimiter as unknown as { resetKey: (key: string) => void });
  }
  if (typeof writeLimiter === 'function' && 'resetKey' in writeLimiter) {
    activeRateLimiters.push(writeLimiter as unknown as { resetKey: (key: string) => void });
  }
  if (typeof healthLimiter === 'function' && 'resetKey' in healthLimiter) {
    activeRateLimiters.push(healthLimiter as unknown as { resetKey: (key: string) => void });
  }

  router.post('/dlq', serviceAuth, writeLimiter, AddEntry);
  router.get('/dlq', serviceAuth, ListEntries);
  router.delete('/dlq', serviceAuth, writeLimiter, DeleteEntries);
  router.post('/dlq/replay', serviceAuth, replayLimiter, ReplayEntries);
  router.get('/health', healthLimiter, HealthCheck);
  router.get('/health/ready', healthLimiter, ReadyCheck);
  router.get('/metrics', metricsHandler);

  return router;
};
