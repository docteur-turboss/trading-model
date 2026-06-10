import { Router, Request, Response } from 'express';

import { BackPressure } from '../scheduler/back-pressure';
import { InternalQueue } from '../scheduler/internal-queue';
import { WorkerRegistry } from '../worker/worker-registry';

export function healthRoutes(
  queue: InternalQueue,
  backPressure: BackPressure,
  workers: WorkerRegistry,
): Router {
  const router = Router();

  router.get('/ping', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/health', (_req: Request, res: Response) => {
    const queueDepth = queue.depth();

    res.json({
      status: 'ok',
      queueDepth,
      canAccept: backPressure.canAccept(),
      workerCount: workers.count(),
      averageLoad: workers.averageLoad(),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
