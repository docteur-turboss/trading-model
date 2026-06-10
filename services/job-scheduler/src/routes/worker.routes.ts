import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { WorkerRegistry } from '../worker/worker-registry';

const registerSchema = z.object({
  workerId: z.string().min(1),
  address: z.string().min(1),
  port: z.number().int().positive(),
  capabilities: z.array(z.string()).default([]),
  maxConcurrency: z.number().int().positive().default(1),
});

const heartbeatSchema = z.object({
  workerId: z.string().min(1),
  currentLoad: z.number().min(0).default(0),
});

export function workerRoutes(workers: WorkerRegistry): Router {
  const router = Router();

  router.post('/workers/register', (req: Request, res: Response) => {
    try {
      const body = registerSchema.parse(req.body);

      workers.register(body.workerId, {
        workerId: body.workerId,
        address: body.address,
        port: body.port,
        capabilities: body.capabilities,
        maxConcurrency: body.maxConcurrency,
        currentLoad: 0,
      });

      res.status(201).json({ status: 'registered', workerId: body.workerId });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
    }
  });

  router.post('/workers/heartbeat', (req: Request, res: Response) => {
    try {
      const body = heartbeatSchema.parse(req.body);

      workers.heartbeat(body.workerId);
      workers.updateLoad(body.workerId, body.currentLoad);

      res.json({ status: 'ok' });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
    }
  });

  router.get('/workers', (_req: Request, res: Response) => {
    const all = workers.getAllActive();
    res.json({ count: all.length, workers: all });
  });

  return router;
}
