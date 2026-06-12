import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { SubmitJobSchema } from '../routes/job.schema';
import { JobScheduler } from '../scheduler/job-scheduler';

export function createJobController(scheduler: JobScheduler) {
  const submit: RequestHandler = catchSync(async req => {
    const parsed = SubmitJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        400,
      );
    }

    const { type, payload, priority, maxRetries } = parsed.data;

    try {
      const jobId = await scheduler.submit(type, payload, priority as 1 | 2 | 3 | 4 | 5, maxRetries);
      return sendResponse({ jobId, status: 'queued' }, 201);
    } catch (err) {
      if (err instanceof Error && (err as Error & { code: string }).code === 'BACK_PRESSURE') {
        const retryAfter = (err as Error & { retryAfter: number }).retryAfter ?? 30;
        return sendResponse(
          {
            error: 'BACK_PRESSURE',
            message: `Job scheduler at capacity. Retry after ${retryAfter} seconds.`,
            retryAfter,
          },
          429,
        );
      }
      throw err;
    }
  });

  const getById: RequestHandler = catchSync(async req => {
    const job = await scheduler.repository.findById(String(req.params.id));
    if (!job) return sendResponse({ error: 'Job not found' }, 404);

    return sendResponse(job, 200);
  });

  const cancel: RequestHandler = catchSync(async req => {
    try {
      await scheduler.cancel(String(req.params.id));
      return sendResponse({ status: 'cancelled' }, 200);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot cancel')) {
        return sendResponse({ error: 'CONFLICT', message: err.message }, 409);
      }
      throw err;
    }
  });

  return { submit, getById, cancel };
}
