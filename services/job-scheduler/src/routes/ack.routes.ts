import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { JobScheduler } from '../scheduler/job-scheduler';

const completeSchema = z.object({
  result: z.unknown().optional(),
});

const failSchema = z.object({
  error: z.string().min(1),
});

export function ackRoutes(scheduler: JobScheduler): Router {
  const router = Router();

  router.post('/jobs/:id/ack', async (req: Request, res: Response) => {
    try {
      await scheduler.ack(req.params.id);
      res.json({ status: 'acknowledged' });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
    }
  });

  router.post('/jobs/:id/complete', async (req: Request, res: Response) => {
    try {
      const body = completeSchema.parse(req.body);
      await scheduler.complete(req.params.id, body.result);
      res.json({ status: 'completed' });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
    }
  });

  router.post('/jobs/:id/fail', async (req: Request, res: Response) => {
    try {
      const body = failSchema.parse(req.body);
      await scheduler.fail(req.params.id, body.error);
      res.json({ status: 'failed' });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
    }
  });

  return router;
}
