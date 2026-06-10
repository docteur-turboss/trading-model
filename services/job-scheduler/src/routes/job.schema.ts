import { z } from 'zod';

export const SubmitJobSchema = z.object({
  type: z.string().min(1),
  payload: z.unknown(),
  priority: z.number().int().min(1).max(5).default(3),
  maxRetries: z.number().int().min(0).default(3),
});

export const JobIdParamsSchema = z.object({
  id: z.string().min(1),
});
