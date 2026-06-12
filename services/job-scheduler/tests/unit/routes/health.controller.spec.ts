import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { createReq, createRes, createNext } from '../../helpers/express';

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync: (fn: any) => fn,
}));

jest.mock('@trading-model/common/middleware/response-exception', () => {
  const sendResponse = (data: any, status: number) => ({ status, data });
  return { sendResponse };
});

import { InternalQueue } from '../../../src/scheduler/internal-queue';
import { BackPressure } from '../../../src/scheduler/back-pressure';
import { WorkerRegistry } from '../../../src/worker/worker-registry';
import { createHealthController } from '../../../src/controllers/health.controller';

describe('HealthController', () => {
  let queue: InternalQueue;
  let backPressure: BackPressure;
  let workers: WorkerRegistry;
  let controller: ReturnType<typeof createHealthController>;

  beforeEach(() => {
    queue = new InternalQueue(30000);
    backPressure = new BackPressure(100, 0.85);
    workers = new WorkerRegistry(30000);
    controller = createHealthController(queue, backPressure, workers);
  });

  describe('ping', () => {
    it('should return 200 with status ok', async () => {
      const result = await controller.ping(createReq(), createRes(), createNext);

      expect(result).toMatchObject({ status: 200 });
      expect((result as any).data).toHaveProperty('status', 'ok');
      expect((result as any).data).toHaveProperty('timestamp');
    });
  });

  describe('health', () => {
    it('should return 200 with health metrics', async () => {
      queue.enqueue({
        id: 'j1',
        type: 't',
        payload: {},
        priority: 3,
        status: 'queued',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
      });

      const result = await controller.health(createReq(), createRes(), createNext);

      expect(result).toMatchObject({ status: 200 });
      expect((result as any).data).toMatchObject({
        status: 'ok',
        queueDepth: 1,
        canAccept: true,
        workerCount: 0,
        averageLoad: 0,
      });
      expect((result as any).data).toHaveProperty('timestamp');
    });
  });
});
