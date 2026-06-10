import { Router } from 'express';

import { createEventsController } from './events.controller';
import { AuditRepository } from '../persistence/audit-repository';

export function eventsRoutes(auditRepo: AuditRepository): Router {
  const router = Router();
  const controller = createEventsController(auditRepo);

  router.get('/events', controller.listEvents);
  router.get('/events/stats', controller.getStats);
  router.get('/events/:messageId', controller.getEvent);

  return router;
}
