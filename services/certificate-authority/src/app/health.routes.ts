import { Request, Response, Router } from 'express';

import { container } from './container';

export function healthRoutes(): Router {
  const router = Router();

  router.get('/ping', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/health', async (_req: Request, res: Response) => {
    const checks: Record<string, string> = {};

    checks.mongodb = container.certificateStore?.isConnected() ? 'ok' : 'degraded';
    checks.redis = container.redisCache?.isAvailable() ? 'ok' : 'degraded';
    checks.ca = container.ca?.isOperational() ? 'ok' : 'degraded';
    checks.crl_store = container.crlStore?.isConnected() ? 'ok' : 'degraded';
    checks.signing =
      container.ca?.signingQueueLength() !== undefined
        ? container.ca.signingQueueLength() < 100
          ? 'ok'
          : 'backpressure'
        : 'unknown';

    const allOk = Object.values(checks).every(v => v === 'ok');
    const statusCode = allOk ? 200 : 503;

    res.status(statusCode).json({
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      signing_queue_depth: container.ca?.signingQueueLength() ?? -1,
      revoked_certs: container.crlCache?.size ?? -1,
    });
  });

  return router;
}
