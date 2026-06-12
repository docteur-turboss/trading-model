import { Router } from 'express';

import { createJobController } from '../controllers/job.controller';
import { JobScheduler } from '../scheduler/job-scheduler';

export function jobRoutes(scheduler: JobScheduler): Router {
  const router = Router();
  const controller = createJobController(scheduler);

  router.post('/jobs', controller.submit);
  router.get('/jobs/:id', controller.getById);
  router.post('/jobs/:id/cancel', controller.cancel);

  return router;
}
