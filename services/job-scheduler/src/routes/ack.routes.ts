import { Router } from 'express';

import { createAckController } from './ack.controller';
import { JobScheduler } from '../scheduler/job-scheduler';

export function ackRoutes(scheduler: JobScheduler): Router {
  const router = Router();
  const controller = createAckController(scheduler);

  router.post('/jobs/:id/ack', controller.ack);
  router.post('/jobs/:id/complete', controller.complete);
  router.post('/jobs/:id/fail', controller.fail);

  return router;
}
