import { Router } from 'express';

import { logger } from '@trading-model/common/config/logger';
import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { env } from '../config/env';
import { authMiddleware } from './auth';
import { ResponseCache } from './cache';
import { forwardRequest } from './proxy-handler';
import { defaultLimiter } from './rate-limiter';
import { ServiceResolver } from './service-resolver';

const resolver = new ServiceResolver(env.DISCOVERY_SERVICE_URL, env.CACHE_TTL_MS);
const cache = new ResponseCache(env.CACHE_TTL_MS);

const VERSION_PATH_REGEX = /^\/v(\d+)\/([^/]+)(\/.*)?$/;

export function createRouter(): Router {
  const router = Router();

  router.get('/ping', (_req, res) => {
    res.json({ status: 'ok', service: 'api-gateway' });
  });

  router.use(authMiddleware);
  router.use(defaultLimiter);

  router.use(catchSync(async req => {
    const match = req.path.match(VERSION_PATH_REGEX);
    if (!match) {
      return sendResponse({ error: 'Invalid route format. Expected /v{version}/{serviceName}/**' }, 400);
    }

    const majorVersion = parseInt(match[1], 10);
    const serviceName = match[2];
    const path = match[3] ?? '/';

    if (Number.isNaN(majorVersion) || majorVersion < 1) {
      return sendResponse({ error: 'Invalid version number' }, 400);
    }

    const target = await resolver.resolve(serviceName, majorVersion);
    if (!target) {
      logger.warn('Service not found', { serviceName, majorVersion });
      return sendResponse({
        error: 'Service not found',
        service: serviceName,
        version: majorVersion,
      }, 404);
    }

    const cacheKey = `${req.method}:${req.path}`;
    if (req.method === 'GET') {
      const cached = cache.get(cacheKey);
      if (cached) {
        return sendResponse(cached.data, cached.status);
      }
    }

    try {
      const result = await forwardRequest(req, target, path);

      if (req.method === 'GET' && result.status === 200) {
        const parsed = tryParseJson(result.body);
        if (parsed) {
          cache.set(cacheKey, parsed, result.status);
        }
      }

      const parsedBody = tryParseJson(result.body);
      return sendResponse(parsedBody ?? result.body, result.status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Proxy error', {
        serviceName,
        majorVersion,
        target: `${target.host}:${target.port}`,
        error: message,
      });
      return sendResponse({ error: 'Service unavailable', details: message }, 503);
    }
  }));

  return router;
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
