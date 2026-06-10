import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { JobScheduler } from '../scheduler/job-scheduler';

const submitJobSchema = z.object({
  type: z.string().min(1),
  payload: z.unknown(),
  priority: z.number().int().min(1).max(5).default(3),
  maxRetries: z.number().int().min(0).default(3),
});

export function jobRoutes(scheduler: JobScheduler): Router {
  const router = Router();

  router.post('/jobs', async (req: Request, res: Response) => {
    try {
      const body = submitJobSchema.parse(req.body);

      const jobId = await scheduler.submit(
        body.type,
        body.payload,
        body.priority as 1 | 2 | 3 | 4 | 5,
        body.maxRetries,
      );

      res.status(201).json({ jobId, status: 'queued' });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
        return;
      }

      if (err instanceof Error && (err as Error & { code: string }).code === 'BACK_PRESSURE') {
        const retryAfter = (err as Error & { retryAfter: number }).retryAfter ?? 30;
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({
          error: 'BACK_PRESSURE',
          message: 'Job scheduler at capacity. Retry after ' + retryAfter + ' seconds.',
          retryAfter,
        });
        return;
      }

      res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
    }
  });

  router.get('/jobs/:id', async (req: Request, res: Response) => {
    try {
      const job = await scheduler.repository.findById(req.params.id);
      if (!job) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Job not found' });
        return;
      }
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
    }
  });

  router.post('/jobs/:id/cancel', async (req: Request, res: Response) => {
    try {
      await scheduler.cancel(req.params.id);
      res.json({ status: 'cancelled' });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot cancel')) {
        res.status(409).json({ error: 'CONFLICT', message: err.message });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
    }
  });

  return router;
}
