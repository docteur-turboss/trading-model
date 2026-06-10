import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createReq, createNext } from '../helpers/express';

jest.mock('../../src/config/env', () => ({
  env: {
    DISCOVERY_SERVICE_URL: 'https://discovery:3000',
    AUTH_TOKEN_HEADER: 'x-api-key',
    AUTH_TOKENS: '',
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX: 1000,
    CACHE_TTL_MS: 5000,
    PROXY_TIMEOUT_MS: 5000,
  },
}));

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync: (fn: any) => fn,
}));

jest.mock('@trading-model/common/middleware/response-exception', () => ({
  sendResponse: (data: any, status: number) => ({ status, data }),
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/core/service-resolver', () => ({
  ServiceResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn().mockImplementation((name: string) => {
      if (name === 'unknown-service') return Promise.resolve(null);
      return Promise.resolve({ host: '10.0.1.5', port: 3000, version: '1.2.0' });
    }),
  })),
}));

jest.mock('../../src/core/proxy-handler', () => ({
  forwardRequest: jest.fn().mockResolvedValue({
    status: 200,
    body: JSON.stringify({ data: 'ok' }),
    headers: { 'content-type': 'application/json' },
  }),
}));

jest.mock('../../src/core/rate-limiter', () => ({
  defaultLimiter: jest.fn((_req: any, _res: any, next: () => void) => next()),
  strictLimiter: jest.fn((_req: any, _res: any, next: () => void) => next()),
}));

jest.mock('../../src/core/auth', () => ({
  authMiddleware: jest.fn((_req: any, _res: any, next: () => void) => next()),
}));

import { createRouter } from '../../src/core/router';

describe('router', () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(() => {
    jest.clearAllMocks();
    router = createRouter();
  });

  it('should have a ping route', () => {
    const pingRoute = router.stack.find(
      (layer: any) => layer.route && layer.route.path === '/ping',
    );
    expect(pingRoute).toBeDefined();
  });

  it('should respond to /ping', () => {
    const req = createReq({ method: 'GET', url: '/ping', path: '/ping' });
    const res = { json: jest.fn() };

    const pingLayer = router.stack.find(
      (layer: any) => layer.route && layer.route.path === '/ping',
    );
    expect(pingLayer).toBeDefined();

    if (pingLayer) {
      pingLayer.route.stack[0].handle(req, res, createNext);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok', service: 'api-gateway' });
    }
  });

  it('should have the catch-all middleware', () => {
    const middlewareLayers = router.stack.filter(
      (layer: any) => !layer.route,
    );
    expect(middlewareLayers.length).toBeGreaterThanOrEqual(3);
  });

  it('should have auth middleware mounted', () => {
    const nonRouteLayers = router.stack.filter(
      (layer: any) => !layer.route,
    );

    const authLayer = nonRouteLayers.find(
      (layer: any) => layer.name === 'authMiddleware' || layer.handle === require('../../src/core/auth').authMiddleware,
    );

    expect(authLayer).toBeDefined();
  });
});
