import { Router } from 'express';

import { BackPressure } from '../scheduler/back-pressure';
import { InternalQueue } from '../scheduler/internal-queue';
import { WorkerRegistry } from '../worker/worker-registry';
import { createHealthController } from './health.controller';

export function healthRoutes(
  queue: InternalQueue,
  backPressure: BackPressure,
  workers: WorkerRegistry,
): Router {
  const router = Router();
  const controller = createHealthController(queue, backPressure, workers);

  router.get('/ping', controller.ping);
  router.get('/health', controller.health);

  return router;
}
