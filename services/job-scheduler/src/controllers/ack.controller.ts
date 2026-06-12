import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { CompleteJobSchema, FailJobSchema } from '../routes/ack.schema';
import { JobScheduler } from '../scheduler/job-scheduler';

export function createAckController(scheduler: JobScheduler) {
  const ack: RequestHandler = catchSync(async req => {
    await scheduler.ack(String(req.params.id));
    return sendResponse({ status: 'acknowledged' }, 200);
  });

  const complete: RequestHandler = catchSync(async req => {
    const parsed = CompleteJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        400
      );
    }

    await scheduler.complete(String(req.params.id), parsed.data.result);
    return sendResponse({ status: 'completed' }, 200);
  });

  const fail: RequestHandler = catchSync(async req => {
    const parsed = FailJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        400
      );
    }

    await scheduler.fail(String(req.params.id), parsed.data.error);
    return sendResponse({ status: 'failed' }, 200);
  });

  return { ack, complete, fail };
}
