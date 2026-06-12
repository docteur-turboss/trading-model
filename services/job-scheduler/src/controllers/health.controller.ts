import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { BackPressure } from '../scheduler/back-pressure';
import { InternalQueue } from '../scheduler/internal-queue';
import { WorkerRegistry } from '../worker/worker-registry';

export function createHealthController(
  queue: InternalQueue,
  backPressure: BackPressure,
  workers: WorkerRegistry,
) {
  const ping: RequestHandler = catchSync(async () => {
    return sendResponse({ status: 'ok', timestamp: new Date().toISOString() }, 200);
  });

  const health: RequestHandler = catchSync(async () => {
    const queueDepth = queue.depth();

    return sendResponse(
      {
        status: 'ok',
        queueDepth,
        canAccept: backPressure.canAccept(),
        workerCount: workers.count(),
        averageLoad: workers.averageLoad(),
        timestamp: new Date().toISOString(),
      },
      200,
    );
  });

  return { ping, health };
}
