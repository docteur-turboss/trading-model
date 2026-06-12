import { Router } from 'express';

import { createWorkerController } from '../controllers/worker.controller';
import { WorkerRegistry } from '../worker/worker-registry';

export function workerRoutes(workers: WorkerRegistry): Router {
  const router = Router();
  const controller = createWorkerController(workers);

  router.post('/workers/register', controller.register);
  router.post('/workers/heartbeat', controller.heartbeat);
  router.get('/workers', controller.list);

  return router;
}
