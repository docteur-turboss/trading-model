import { Router } from 'express';

import { ping, health } from '../controllers/health.controller';

export function healthRoutes(): Router {
  const router = Router();

  router.get('/ping', ping);
  router.get('/health', health);

  return router;
}
