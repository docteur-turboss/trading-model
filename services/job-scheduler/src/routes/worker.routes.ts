import { Router } from 'express';

import { WorkerRegistry } from '../worker/worker-registry';
import { createWorkerController } from './worker.controller';

export function workerRoutes(workers: WorkerRegistry): Router {
  const router = Router();
  const controller = createWorkerController(workers);

  router.post('/workers/register', controller.register);
  router.post('/workers/heartbeat', controller.heartbeat);
  router.get('/workers', controller.list);

  return router;
}
