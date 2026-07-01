import { Router } from 'express';

import { LogRepository } from '../persistence/log-repository';
import { getLogsController } from '../controllers/logs.controller';

export function logsRoutes(logRepo: LogRepository): Router {
  const router = Router();
  const controller = getLogsController(logRepo);

  router.get('/logs', controller.listLogs);
  router.get('/logs/stats', controller.getLogStats);
  router.get('/logs/:id', controller.getLogById);

  return router;
}
