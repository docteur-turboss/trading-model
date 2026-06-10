import { Router } from 'express';

import { JobScheduler } from '../scheduler/job-scheduler';
import { createJobController } from './job.controller';

export function jobRoutes(scheduler: JobScheduler): Router {
  const router = Router();
  const controller = createJobController(scheduler);

  router.post('/jobs', controller.submit);
  router.get('/jobs/:id', controller.getById);
  router.post('/jobs/:id/cancel', controller.cancel);

  return router;
}
