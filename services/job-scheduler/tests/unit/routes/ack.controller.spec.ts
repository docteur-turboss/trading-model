import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { createReq, createRes, createNext } from '../../helpers/express';

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync: (fn: any) => fn,
}));

jest.mock('@trading-model/common/middleware/response-exception', () => {
  const sendResponse = (data: any, status: number) => ({ status, data });
  return { sendResponse };
});

jest.mock('../../../src/config/env', () => ({
  env: {
    ACK_TIMEOUT_MS: 30000,
    MAX_QUEUE_DEPTH: 10000,
    MAX_WORKER_LOAD_RATIO: 0.85,
    MAX_RETRIES_PER_JOB: 3,
    ORPHAN_SCAN_INTERVAL_MS: 10000,
    WORKER_HEARTBEAT_TTL_MS: 30000,
  },
}));

import { JobScheduler } from '../../../src/scheduler/job-scheduler';
import { createAckController } from '../../../src/controllers/ack.controller';

function createMockScheduler(): jest.Mocked<JobScheduler> {
  return {
    submit: jest.fn<(...args: any[]) => any>(),
    cancel: jest.fn<(...args: any[]) => any>(),
    ack: jest.fn<(...args: any[]) => any>(),
    complete: jest.fn<(...args: any[]) => any>(),
    fail: jest.fn<(...args: any[]) => any>(),
    queue: {} as any,
    backPressure: {} as any,
    workers: {} as any,
    reAllocator: {} as any,
    orphanDetector: {} as any,
    repository: {
      findById: jest.fn<(...args: any[]) => any>(),
      insert: jest.fn<(...args: any[]) => any>(),
      updateStatus: jest.fn<(...args: any[]) => any>(),
      incrementRetry: jest.fn<(...args: any[]) => any>(),
      findNonTerminal: jest.fn<(...args: any[]) => any>(),
      findByWorker: jest.fn<(...args: any[]) => any>(),
      findByStatus: jest.fn<(...args: any[]) => any>(),
      ensureIndexes: jest.fn<(...args: any[]) => any>(),
    },
    setWorkerProtocol: jest.fn<(...args: any[]) => any>(),
    start: jest.fn<(...args: any[]) => any>(),
    stop: jest.fn<(...args: any[]) => any>(),
    onWorkerDisconnect: jest.fn<(...args: any[]) => any>(),
  } as unknown as jest.Mocked<JobScheduler>;
}

describe('AckController', () => {
  let scheduler: jest.Mocked<JobScheduler>;
  let controller: ReturnType<typeof createAckController>;

  beforeEach(() => {
    jest.clearAllMocks();

    scheduler = createMockScheduler();
    controller = createAckController(scheduler);
  });

  describe('ack', () => {
    it('should acknowledge a job and return 200', async () => {
      (scheduler.ack as any).mockResolvedValue(undefined);

      const result = await controller.ack(
        createReq({ params: { id: 'job-1' } }),
        createRes(),
        createNext
      );

      expect(result).toMatchObject({ status: 200, data: { status: 'acknowledged' } });
      expect(scheduler.ack).toHaveBeenCalledWith('job-1');
    });
  });

  describe('complete', () => {
    it('should reject empty body with 400', async () => {
      const result = await controller.complete(
        createReq({ params: { id: 'job-1' }, body: null }),
        createRes(),
        createNext
      );

      expect(result).toMatchObject({ status: 400 });
    });

    it('should complete a job and return 200', async () => {
      (scheduler.complete as any).mockResolvedValue(undefined);

      const result = await controller.complete(
        createReq({ params: { id: 'job-1' }, body: { result: { data: 42 } } }),
        createRes(),
        createNext
      );

      expect(result).toMatchObject({ status: 200, data: { status: 'completed' } });
      expect(scheduler.complete).toHaveBeenCalledWith('job-1', { data: 42 });
    });
  });

  describe('fail', () => {
    it('should reject empty body with 400', async () => {
      const result = await controller.fail(
        createReq({ params: { id: 'job-1' }, body: null }),
        createRes(),
        createNext
      );

      expect(result).toMatchObject({ status: 400 });
    });

    it('should reject missing error field', async () => {
      const result = await controller.fail(
        createReq({ params: { id: 'job-1' }, body: {} }),
        createRes(),
        createNext
      );

      expect(result).toMatchObject({ status: 400 });
    });

    it('should fail a job and return 200', async () => {
      (scheduler.fail as any).mockResolvedValue(undefined);

      const result = await controller.fail(
        createReq({ params: { id: 'job-1' }, body: { error: 'timeout' } }),
        createRes(),
        createNext
      );

      expect(result).toMatchObject({ status: 200, data: { status: 'failed' } });
      expect(scheduler.fail).toHaveBeenCalledWith('job-1', 'timeout');
    });
  });
});
