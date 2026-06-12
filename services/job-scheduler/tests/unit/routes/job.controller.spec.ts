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
import { createJobController } from '../../../src/controllers/job.controller';

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

describe('JobController', () => {
  let scheduler: jest.Mocked<JobScheduler>;
  let controller: ReturnType<typeof createJobController>;

  beforeEach(() => {
    jest.clearAllMocks();

    scheduler = createMockScheduler();
    controller = createJobController(scheduler);
  });

  describe('submit', () => {
    it('should reject invalid body with 400', async () => {
      const result = await controller.submit(
        createReq({ body: null }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 400 });
    });

    it('should reject empty type with 400', async () => {
      const result = await controller.submit(
        createReq({ body: { type: '' } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 400 });
    });

    it('should return 201 with jobId on success', async () => {
      (scheduler.submit as any).mockResolvedValue('new-job-id');

      const result = await controller.submit(
        createReq({ body: { type: 'test-type', payload: {} } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 201, data: { jobId: 'new-job-id', status: 'queued' } });
    });

    it('should return 429 on back pressure', async () => {
      (scheduler.submit as any).mockRejectedValue(
        Object.assign(new Error('Job scheduler at capacity'), {
          code: 'BACK_PRESSURE',
          retryAfter: 30,
        }),
      );

      const result = await controller.submit(
        createReq({ body: { type: 'test-type', payload: {} } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 429, data: { error: 'BACK_PRESSURE' } });
    });

    it('should return 429 with default retryAfter when not provided', async () => {
      (scheduler.submit as any).mockRejectedValue(
        Object.assign(new Error('Job scheduler at capacity'), {
          code: 'BACK_PRESSURE',
        }),
      );

      const result = await controller.submit(
        createReq({ body: { type: 'test', payload: {} } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 429, data: { retryAfter: 30 } });
    });
  });

  describe('getById', () => {
    it('should return 404 when job not found', async () => {
      (scheduler.repository.findById as any).mockResolvedValue(null);

      const result = await controller.getById(
        createReq({ params: { id: 'unknown' } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 404 });
    });

    it('should return job data on success', async () => {
      const mockJob = { id: 'job-1', type: 'test', status: 'queued' };
      (scheduler.repository.findById as any).mockResolvedValue(mockJob);

      const result = await controller.getById(
        createReq({ params: { id: 'job-1' } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 200, data: mockJob });
    });
  });

  describe('cancel', () => {
    it('should return 409 when cancellation is not allowed', async () => {
      (scheduler.cancel as any).mockRejectedValue(new Error('Cannot cancel a running or completed job'));

      const result = await controller.cancel(
        createReq({ params: { id: 'running-job' } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 409 });
    });

    it('should return 200 on successful cancellation', async () => {
      (scheduler.cancel as any).mockResolvedValue(undefined);

      const result = await controller.cancel(
        createReq({ params: { id: 'queued-job' } }),
        createRes(),
        createNext,
      );

      expect(result).toMatchObject({ status: 200, data: { status: 'cancelled' } });
    });
  });
});

describe('JobController — rethrow errors', () => {
  let scheduler: jest.Mocked<JobScheduler>;
  let controller: ReturnType<typeof createJobController>;

  beforeEach(() => {
    scheduler = createMockScheduler();
    controller = createJobController(scheduler);
  });

  it('should re-throw non-BACK_PRESSURE errors in submit', async () => {
    (scheduler.submit as any).mockRejectedValue(new Error('DB connection failed'));

    await expect(
      controller.submit(
        createReq({ body: { type: 'test', payload: {} } }),
        createRes(),
        createNext,
      ),
    ).rejects.toThrow('DB connection failed');
  });

  it('should re-throw non-cancellation errors in cancel', async () => {
    (scheduler.cancel as any).mockRejectedValue(new Error('DB connection failed'));

    await expect(
      controller.cancel(
        createReq({ params: { id: 'job-1' } }),
        createRes(),
        createNext,
      ),
    ).rejects.toThrow('DB connection failed');
  });
});
