import { z } from 'zod';

export const CompleteJobSchema = z.object({
  result: z.unknown().optional(),
});

export const FailJobSchema = z.object({
  error: z.string().min(1),
});
