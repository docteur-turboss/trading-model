import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

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
import { JobRepository } from '../../../src/persistence/job-repository';
import type { WorkerProtocol } from '../../../src/worker/worker-protocol';

type MockLogger = { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };
const mockLogger = (jest.requireMock('@trading-model/common/config/logger') as { logger: MockLogger }).logger;

describe('JobScheduler', () => {
  let scheduler: JobScheduler;
  let mockRepository: jest.Mocked<JobRepository>;

  beforeEach(() => {
    jest.useFakeTimers();

    mockRepository = {
      insert: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      incrementRetry: jest.fn(),
      findNonTerminal: jest.fn(),
      findByWorker: jest.fn(),
      findByStatus: jest.fn(),
      ensureIndexes: jest.fn(),
    } as unknown as jest.Mocked<JobRepository>;

    scheduler = new JobScheduler(mockRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('submit', () => {
    it('should create and enqueue a job', async () => {
      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      const jobId = await scheduler.submit('test-type', { data: 1 }, 3, 3);

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      expect(mockRepository.insert).toHaveBeenCalled();
      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        jobId,
        'queued',
      );
    });

    it('should throw BACK_PRESSURE when queue is full', async () => {
      scheduler.backPressure.updateQueueDepth(99999);

      await expect(
        scheduler.submit('test-type', {}),
      ).rejects.toThrow('Job scheduler at capacity');
    });

    it('should log error when enqueueJob updateStatus fails', async () => {
      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockRejectedValue(new Error('DB error'));

      await scheduler.submit('test-type', {});

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to persist queued status',
        expect.objectContaining({ error: 'Error: DB error' }),
      );
    });
  });

  describe('ack', () => {
    it('should update job status to running', async () => {
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.ack('job-1');

      expect(mockRepository.updateStatus).toHaveBeenCalledWith('job-1', 'running');
    });
  });

  describe('complete', () => {
    it('should update job status to completed', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 1,
      });

      mockRepository.findById.mockResolvedValue({
        id: 'job-1',
        assignedWorkerId: 'w1',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'running',
        ackDeadline: Date.now() + 30000,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.complete('job-1', { result: 'ok' });

      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        'job-1',
        'completed',
        expect.objectContaining({ result: { result: 'ok' } }),
      );
    });

    it('should handle complete without assignedWorkerId', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-no-worker',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'running',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.complete('job-no-worker', { ok: true });

      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        'job-no-worker',
        'completed',
        expect.any(Object),
      );
    });

    it('should handle complete when worker is not found in registry', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-worker-gone',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'running',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: 'nonexistent',
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await expect(scheduler.complete('job-worker-gone', {})).resolves.not.toThrow();
    });
  });

  describe('fail', () => {
    it('should re-enqueue job when retries remain', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-retry',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'running',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.fail('job-retry', 'timeout');

      expect(mockRepository.incrementRetry).toHaveBeenCalledWith('job-retry');
      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        'job-retry',
        'queued',
        expect.any(Object),
      );
      expect(scheduler.queue.depth()).toBe(1);
    });

    it('should mark job as failed when max retries exceeded', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-fail',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'running',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 3,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.fail('job-fail', 'fatal');

      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        'job-fail',
        'failed',
        expect.objectContaining({ error: 'fatal' }),
      );
    });

    it('should do nothing for unknown job', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        scheduler.fail('unknown', 'error'),
      ).resolves.not.toThrow();
    });

    it('should decrement worker load when failing with assigned worker', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      mockRepository.findById.mockResolvedValue({
        id: 'job-worker',
        assignedWorkerId: 'w1',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'running',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.fail('job-worker', 'error');

      expect(scheduler.workers.get('w1')!.currentLoad).toBe(1);
    });

    it('should handle fail when worker is not found in registry', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-worker-gone',
        assignedWorkerId: 'nonexistent',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'running',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await expect(scheduler.fail('job-worker-gone', 'error')).resolves.not.toThrow();
    });
  });

  describe('cancel', () => {
    it('should cancel a queued job', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-cancel',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'queued',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.cancel('job-cancel');

      expect(mockRepository.updateStatus).toHaveBeenCalledWith('job-cancel', 'cancelled');
    });

    it('should throw for running job', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-running',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'running',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
      } as any);

      await expect(scheduler.cancel('job-running')).rejects.toThrow('Cannot cancel');
    });

    it('should decrement worker load when cancelling assigned job', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: [],
        maxConcurrency: 5,
        currentLoad: 3,
      });

      mockRepository.findById.mockResolvedValue({
        id: 'job-assigned',
        assignedWorkerId: 'w1',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'queued',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.cancel('job-assigned');

      expect(scheduler.workers.get('w1')!.currentLoad).toBe(2);
    });

    it('should do nothing for unknown job', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(scheduler.cancel('unknown')).resolves.not.toThrow();
    });

    it('should handle cancel when worker is not found in registry', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-cancel-worker',
        assignedWorkerId: 'nonexistent',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'queued',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await expect(scheduler.cancel('job-cancel-worker')).resolves.not.toThrow();
    });
  });

  describe('start', () => {
    it('should recover non-terminal jobs on startup', async () => {
      const queuedJob = {
        id: 'recover-queued',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'queued' as const,
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
      };

      mockRepository.findNonTerminal.mockResolvedValue([queuedJob] as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.start();

      expect(scheduler.queue.depth()).toBe(1);
      expect(scheduler.queue.depth()).toBeGreaterThan(0);
    });

    it('should recover assigned and running jobs as orphaned', async () => {
      const assignedJob = {
        id: 'recover-assigned',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'assigned' as const,
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: 'w1',
      };

      mockRepository.findNonTerminal.mockResolvedValue([assignedJob] as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.start();

      expect(mockRepository.updateStatus).toHaveBeenCalledWith('recover-assigned', 'orphaned');
    });

    it('should recover orphaned jobs via reAllocator', async () => {
      const orphanedJob = {
        id: 'recover-orphan',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'orphaned' as const,
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
      };

      mockRepository.findNonTerminal.mockResolvedValue([orphanedJob] as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.start();

      expect(scheduler.queue.depth()).toBe(1);
    });

    it('should skip jobs with unknown status during recovery', async () => {
      const unknownJob = {
        id: 'recover-unknown',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'unknown' as any,
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
      };

      mockRepository.findNonTerminal.mockResolvedValue([unknownJob] as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await expect(scheduler.start()).resolves.not.toThrow();
    });
  });

  describe('onWorkerDisconnect', () => {
    it('should remove worker from back pressure tracking', () => {
      scheduler.backPressure.updateWorkerLoad('w1', 0.9);
      expect(scheduler.backPressure.canAccept()).toBe(false);

      scheduler.onWorkerDisconnect('w1');
      expect(scheduler.backPressure.canAccept()).toBe(true);
    });
  });

  describe('setWorkerProtocol', () => {
    it('should store the worker protocol reference', async () => {
      const protocol = { sendToWorker: jest.fn() } as unknown as WorkerProtocol;
      scheduler.setWorkerProtocol(protocol);

      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.submit('test-type', {});

      expect(protocol.sendToWorker).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop orphan detector, queue, and close protocol', async () => {
      const protocol = { close: jest.fn() } as unknown as WorkerProtocol;
      scheduler.setWorkerProtocol(protocol);

      await scheduler.stop();

      expect(protocol.close).toHaveBeenCalled();
    });

    it('should stop without worker protocol', async () => {
      await expect(scheduler.stop()).resolves.not.toThrow();
    });
  });

  describe('handleAckTimeout', () => {
    async function triggerAckTimeout(jobMocks: { findById?: any; updateStatus?: any } = {}) {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 3,
      });

      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      if (jobMocks.findById) {
        mockRepository.findById.mockResolvedValue(jobMocks.findById);
      }
      if (jobMocks.updateStatus !== undefined) {
        mockRepository.updateStatus.mockResolvedValue(jobMocks.updateStatus);
      }

      await scheduler.submit('test-type', {}, 1, 3);

      jest.advanceTimersByTime(30001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }

    it('should mark job as orphaned on ACK timeout', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-timeout',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'assigned',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: 'w1',
      } as any);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 3,
      });

      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.submit('test-type', {}, 1, 3);

      jest.advanceTimersByTime(30001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogger.warn).toHaveBeenCalledWith('ACK timeout for job', expect.any(Object));
    });

    it('should ignore completed jobs on ACK timeout', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'job-done',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'completed',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
      } as any);

      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 3,
      });

      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.submit('test-type', {}, 1, 3);

      jest.advanceTimersByTime(30001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockRepository.updateStatus).not.toHaveBeenCalledWith('job-done', 'orphaned');
    });

    it('should decrement load for timed-out assigned worker', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 2,
      });

      mockRepository.findById.mockResolvedValue({
        id: 'job-assigned',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'assigned',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: 'w1',
      } as any);
      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.submit('test-type', {}, 1, 3);

      jest.advanceTimersByTime(30001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(scheduler.workers.get('w1')!.currentLoad).toBe(2);
    });

    it('should handle ACK timeout without assignedWorkerId', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 3,
      });

      mockRepository.findById.mockResolvedValue({
        id: 'job-no-worker',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'assigned',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: undefined,
      } as any);
      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.submit('test-type', {}, 1, 3);

      jest.advanceTimersByTime(30001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogger.warn).toHaveBeenCalledWith('ACK timeout for job', expect.any(Object));
    });

    it('should handle ACK timeout when worker is not found in registry', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 3,
      });

      mockRepository.findById.mockResolvedValue({
        id: 'job-orphan',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'assigned',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: 'nonexistent',
      } as any);
      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.submit('test-type', {}, 1, 3);

      jest.advanceTimersByTime(30001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogger.warn).toHaveBeenCalledWith('ACK timeout for job', expect.any(Object));
    });

    it('should log error when updateStatus fails on ACK timeout', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 3,
      });

      mockRepository.findById.mockResolvedValue({
        id: 'job-ack-fail',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'assigned',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
        assignedWorkerId: 'w1',
      } as any);
      mockRepository.insert.mockResolvedValue(undefined);
      let callIdx = 0;
      mockRepository.updateStatus.mockImplementation(() => {
        callIdx++;
        if (callIdx === 3) return Promise.reject(new Error('orphan persist failed'));
        return Promise.resolve(undefined);
      });

      await scheduler.submit('test-type', {}, 1, 3);

      jest.advanceTimersByTime(30001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to persist orphaned status on ACK timeout',
        expect.objectContaining({ error: 'Error: orphan persist failed' }),
      );
    });

    it('should log error when findById fails on ACK timeout', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 3,
      });

      mockRepository.findById.mockRejectedValue(new Error('DB find failed'));
      mockRepository.insert.mockResolvedValue(undefined);
      mockRepository.updateStatus.mockResolvedValue(undefined);

      await scheduler.submit('test-type', {}, 1, 3);

      jest.advanceTimersByTime(30001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to find job on ACK timeout',
        expect.objectContaining({ error: 'Error: DB find failed' }),
      );
    });
  });

  describe('distributeNext error handling', () => {
    it('should log error when updateStatus fails during assignment', async () => {
      scheduler.workers.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['test-type'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      mockRepository.insert.mockResolvedValue(undefined);
      let callIdx = 0;
      mockRepository.updateStatus.mockImplementation(() => {
        callIdx++;
        if (callIdx === 2) return Promise.reject(new Error('DB write failed'));
        return Promise.resolve(undefined);
      });

      await scheduler.submit('test-type', {});

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to persist assigned status',
        expect.objectContaining({ error: 'Error: DB write failed' }),
      );
    });
  });
});
