import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

import { WorkerRegistry } from '../../../src/worker/worker-registry';

describe('WorkerRegistry', () => {
  let registry: WorkerRegistry;

  beforeEach(() => {
    jest.useFakeTimers();
    registry = new WorkerRegistry(10000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('register', () => {
    it('should add a worker to the registry', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      expect(registry.count()).toBe(1);
    });
  });

  describe('unregister', () => {
    it('should remove a worker from the registry', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });
      registry.unregister('worker-1');

      expect(registry.count()).toBe(0);
    });
  });

  describe('get', () => {
    it('should return undefined for unknown worker', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });

    it('should return the worker registration', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      const worker = registry.get('worker-1');
      expect(worker).toBeDefined();
      expect(worker!.status).toBe('active');
    });
  });

  describe('heartbeat', () => {
    it('should update lastHeartbeat for a registered worker', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      const before = registry.get('worker-1')!.lastHeartbeat.getTime();
      jest.advanceTimersByTime(1000);
      registry.heartbeat('worker-1');
      const after = registry.get('worker-1')!.lastHeartbeat.getTime();

      expect(after).toBeGreaterThan(before);
    });

    it('should not fail for unknown worker', () => {
      expect(() => registry.heartbeat('unknown')).not.toThrow();
    });
  });

  describe('updateLoad', () => {
    it('should update the current load of a worker', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      registry.updateLoad('worker-1', 3);
      expect(registry.get('worker-1')!.currentLoad).toBe(3);
    });

    it('should not throw for unknown worker', () => {
      expect(() => registry.updateLoad('unknown', 5)).not.toThrow();
    });
  });

  describe('setStatus', () => {
    it('should update the status of a worker', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      registry.setStatus('worker-1', 'draining');
      expect(registry.get('worker-1')!.status).toBe('draining');
    });

    it('should not throw for unknown worker', () => {
      expect(() => registry.setStatus('unknown', 'offline')).not.toThrow();
    });
  });

  describe('findBestWorker', () => {
    it('should return null when no workers are registered', () => {
      expect(registry.findBestWorker('type-a')).toBeNull();
    });

    it('should return null when no worker supports the job type', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-b'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      expect(registry.findBestWorker('type-a')).toBeNull();
    });

    it('should skip draining workers', () => {
      registry.register('draining-worker', {
        workerId: 'draining-worker',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });
      registry.setStatus('draining-worker', 'draining');

      expect(registry.findBestWorker('type-a')).toBeNull();
    });

    it('should skip workers at max concurrency', () => {
      registry.register('busy-worker', {
        workerId: 'busy-worker',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 2,
        currentLoad: 2,
      });

      expect(registry.findBestWorker('type-a')).toBeNull();
    });

    it('should return the least loaded compatible worker', () => {
      registry.register('busy', {
        workerId: 'busy',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 10,
        currentLoad: 8,
      });
      registry.register('free', {
        workerId: 'free',
        address: '10.0.0.2',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 10,
        currentLoad: 2,
      });

      const best = registry.findBestWorker('type-a');
      expect(best).not.toBeNull();
      expect(best!.workerId).toBe('free');
    });

    it('should skip workers with higher load than current best', () => {
      registry.register('good', {
        workerId: 'good',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 10,
        currentLoad: 2,
      });
      registry.register('worse', {
        workerId: 'worse',
        address: '10.0.0.2',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 10,
        currentLoad: 5,
      });

      const best = registry.findBestWorker('type-a');
      expect(best!.workerId).toBe('good');
    });
  });

  describe('purgeStaleWorkers', () => {
    it('should return empty array when all workers are active', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });
      registry.heartbeat('worker-1');

      const stale = registry.purgeStaleWorkers();
      expect(stale).toEqual([]);
    });

    it('should purge workers with expired heartbeats', () => {
      registry.register('worker-1', {
        workerId: 'worker-1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: ['type-a'],
        maxConcurrency: 5,
        currentLoad: 0,
      });

      jest.advanceTimersByTime(15000);

      const stale = registry.purgeStaleWorkers();
      expect(stale).toContain('worker-1');
      expect(registry.count()).toBe(0);
    });
  });

  describe('count', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.count()).toBe(0);
    });

    it('should return the number of registered workers', () => {
      registry.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: [],
        maxConcurrency: 1,
        currentLoad: 0,
      });
      registry.register('w2', {
        workerId: 'w2',
        address: '10.0.0.2',
        port: 9000,
        capabilities: [],
        maxConcurrency: 1,
        currentLoad: 0,
      });

      expect(registry.count()).toBe(2);
    });
  });

  describe('averageLoad', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.averageLoad()).toBe(0);
    });

    it('should calculate the average load ratio', () => {
      registry.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: [],
        maxConcurrency: 10,
        currentLoad: 5,
      });
      registry.register('w2', {
        workerId: 'w2',
        address: '10.0.0.2',
        port: 9000,
        capabilities: [],
        maxConcurrency: 10,
        currentLoad: 3,
      });

      expect(registry.averageLoad()).toBeCloseTo(0.4, 5);
    });

    it('should handle worker with maxConcurrency of 0', () => {
      registry.register('w1', {
        workerId: 'w1',
        address: '10.0.0.1',
        port: 9000,
        capabilities: [],
        maxConcurrency: 0,
        currentLoad: 0,
      });

      expect(registry.averageLoad()).toBe(0);
    });
  });

  describe('getAllActive', () => {
    it('should return only active workers', () => {
      registry.register('active-w', {
        workerId: 'active-w',
        address: '10.0.0.1',
        port: 9000,
        capabilities: [],
        maxConcurrency: 5,
        currentLoad: 0,
      });
      registry.register('draining-w', {
        workerId: 'draining-w',
        address: '10.0.0.2',
        port: 9000,
        capabilities: [],
        maxConcurrency: 5,
        currentLoad: 0,
      });
      registry.setStatus('draining-w', 'draining');

      const active = registry.getAllActive();
      expect(active).toHaveLength(1);
      expect(active[0].workerId).toBe('active-w');
    });
  });
});
