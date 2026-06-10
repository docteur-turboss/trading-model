import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { createReq, createRes, createNext } from '../../helpers/express';

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync: (fn: any) => fn,
}));

jest.mock('@trading-model/common/middleware/response-exception', () => {
  const sendResponse = (data: any, status: number) => ({ status, data });
  return { sendResponse };
});

import { WorkerRegistry } from '../../../src/worker/worker-registry';
import { createWorkerController } from '../../../src/routes/worker.controller';

describe('WorkerController', () => {
  let workers: WorkerRegistry;
  let controller: ReturnType<typeof createWorkerController>;

  beforeEach(() => {
    workers = new WorkerRegistry(30000);
    controller = createWorkerController(workers);
  });

  describe('register', () => {
    it('should reject invalid body with 400', async () => {
      const result = await controller.register(
        createReq({ body: null }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 400 });
    });

    it('should register a worker and return 201', async () => {
      const payload = {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
      };

      const result = await controller.register(
        createReq({ body: payload }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 201, data: { status: 'registered', workerId: 'worker-1' } });
      expect(workers.count()).toBe(1);
    });

    it('should reject missing address', async () => {
      const result = await controller.register(
        createReq({ body: { workerId: 'w1', port: 9000 } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 400 });
    });
  });

  describe('heartbeat', () => {
    it('should reject invalid body with 400', async () => {
      const result = await controller.heartbeat(
        createReq({ body: null }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 400 });
    });

    it('should update heartbeat and return 200', async () => {
      workers.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: [],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      const result = await controller.heartbeat(
        createReq({ body: { workerId: 'worker-1', currentLoad: 2 } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 200, data: { status: 'ok' } });
      expect(workers.get('worker-1')!.currentLoad).toBe(2);
    });
  });

  describe('list', () => {
    it('should return empty list when no workers', async () => {
      const result = await controller.list(createReq(), createRes(), createNext);

      expect(result).toMatchObject({ status: 200, data: { count: 0, workers: [] } });
    });

    it('should return only active workers', async () => {
      workers.register('active-w', {
        workerId: 'active-w',
        address: '10.0.0.1',
        port: 9000,
        capabilities: [],
        maxConcurrency: 5,
        currentLoad: 0,
      });
      workers.register('inactive-w', {
        workerId: 'inactive-w',
        address: '10.0.0.2',
        port: 9000,
        capabilities: [],
        maxConcurrency: 5,
        currentLoad: 0,
      });
      workers.setStatus('inactive-w', 'offline');

      const result = await controller.list(createReq(), createRes(), createNext);

      expect(result).toMatchObject({ status: 200, data: { count: 1 } });
    });
  });
});
