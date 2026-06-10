import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

import { InternalQueue } from '../../../src/scheduler/internal-queue';
import { createJob } from '../../fixtures/job.fixture';

describe('InternalQueue', () => {
  let queue: InternalQueue;

  beforeEach(() => {
    jest.useFakeTimers();
    queue = new InternalQueue(30000);
  });

  afterEach(() => {
    queue.stop();
    jest.useRealTimers();
  });

  describe('enqueue', () => {
    it('should add a job to the correct priority queue', () => {
      const job = createJob({ priority: 1 });
      queue.enqueue(job);

      expect(queue.depth()).toBe(1);
    });

    it('should enqueue jobs at different priorities', () => {
      queue.enqueue(createJob({ priority: 1 }));
      queue.enqueue(createJob({ priority: 5 }));

      expect(queue.depth()).toBe(2);
    });
  });

  describe('dequeue', () => {
    it('should return null when queue is empty', () => {
      expect(queue.dequeue()).toBeNull();
    });

    it('should return the highest priority job first', () => {
      queue.enqueue(createJob({ id: 'low', priority: 5 }));
      queue.enqueue(createJob({ id: 'high', priority: 1 }));

      const result = queue.dequeue();
      expect(result).not.toBeNull();
      expect(result!.job.id).toBe('high');
    });

    it('should return jobs in FIFO order within the same priority', () => {
      queue.enqueue(createJob({ id: 'first', priority: 3 }));
      queue.enqueue(createJob({ id: 'second', priority: 3 }));

      expect(queue.dequeue()!.job.id).toBe('first');
      expect(queue.dequeue()!.job.id).toBe('second');
    });

    it('should remove the job from the queue', () => {
      queue.enqueue(createJob({ priority: 3 }));
      queue.dequeue();

      expect(queue.depth()).toBe(0);
    });
  });

  describe('markDelivered / ack', () => {
    it('should call onAckTimeout when ack is not called within timeout', () => {
      const onTimeout = jest.fn();
      queue.setOnAckTimeout(onTimeout);

      queue.enqueue(createJob({ id: 'job-1' }));
      queue.markDelivered('job-1');

      jest.advanceTimersByTime(30000);

      expect(onTimeout).toHaveBeenCalledWith('job-1');
    });

    it('should not call onAckTimeout when ack is called in time', () => {
      const onTimeout = jest.fn();
      queue.setOnAckTimeout(onTimeout);

      queue.markDelivered('job-1');
      queue.ack('job-1');

      jest.advanceTimersByTime(30000);

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('should not fail when ack is called for unknown jobId', () => {
      expect(() => queue.ack('unknown')).not.toThrow();
    });
  });

  describe('depth', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.depth()).toBe(0);
    });

    it('should return total count across all priorities', () => {
      queue.enqueue(createJob({ priority: 1 }));
      queue.enqueue(createJob({ priority: 2 }));
      queue.enqueue(createJob({ priority: 5 }));

      expect(queue.depth()).toBe(3);
    });
  });

  describe('markDelivered without callback', () => {
    it('should not throw when ack timeout fires without callback set', () => {
      queue.markDelivered('job-1');
      expect(() => { jest.advanceTimersByTime(30000); }).not.toThrow();
    });
  });

  describe('stop', () => {
    it('should clear all pending ack timers', () => {
      const onTimeout = jest.fn();
      queue.setOnAckTimeout(onTimeout);

      queue.markDelivered('job-1');
      queue.markDelivered('job-2');
      queue.stop();

      jest.advanceTimersByTime(30000);

      expect(onTimeout).not.toHaveBeenCalled();
    });
  });
});
