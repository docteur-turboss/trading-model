import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { RegisterWorkerSchema, WorkerHeartbeatSchema } from '../routes/worker.schema';
import { WorkerRegistry } from '../worker/worker-registry';

export function createWorkerController(workers: WorkerRegistry) {
  const register: RequestHandler = catchSync(async req => {
    const parsed = RegisterWorkerSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        400,
      );
    }

    const { workerId, address, port, capabilities, maxConcurrency } = parsed.data;

    workers.register(workerId, {
      workerId,
      address,
      port,
      capabilities,
      maxConcurrency,
      currentLoad: 0,
    });

    return sendResponse({ status: 'registered', workerId }, 201);
  });

  const heartbeat: RequestHandler = catchSync(async req => {
    const parsed = WorkerHeartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        400,
      );
    }

    const { workerId, currentLoad } = parsed.data;

    workers.heartbeat(workerId);
    workers.updateLoad(workerId, currentLoad);

    return sendResponse({ status: 'ok' }, 200);
  });

  const list: RequestHandler = catchSync(async () => {
    const all = workers.getAllActive();
    return sendResponse({ count: all.length, workers: all }, 200);
  });

  return { register, heartbeat, list };
}
