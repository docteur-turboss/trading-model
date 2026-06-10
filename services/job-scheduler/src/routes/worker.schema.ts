import { z } from 'zod';

export const RegisterWorkerSchema = z.object({
  workerId: z.string().min(1),
  address: z.string().min(1),
  port: z.number().int().positive(),
  capabilities: z.array(z.string()).default([]),
  maxConcurrency: z.number().int().positive().default(1),
});

export const WorkerHeartbeatSchema = z.object({
  workerId: z.string().min(1),
  currentLoad: z.number().min(0).default(0),
});
