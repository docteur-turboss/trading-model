import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CircuitBreaker } from '../../src/discovery/circuit-breaker';
import { IServiceCache, CircuitState } from '../../src/discovery/service-cache.interface';

function createMockCache(): jest.Mocked<IServiceCache> {
  const mock: Partial<jest.Mocked<IServiceCache>> = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
    clear: jest.fn<() => Promise<void>>().mockResolvedValue(),
    entries: jest
      .fn<() => Promise<Array<{ serviceName: string; instance: any; region?: string }>>>()
      .mockResolvedValue([]),
    stop: jest.fn(),
    setCircuitState: jest.fn<() => Promise<void>>().mockResolvedValue(),
    getCircuitState: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    deleteCircuitState: jest.fn<() => Promise<void>>().mockResolvedValue(),
  };
  return mock as jest.Mocked<IServiceCache>;
}

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    circuitBreaker.clear();
    jest.useRealTimers();
  });

  describe('default constructor (no stateStore)', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(3, 10_000, 30_000);
    });

    it('should allow requests when no failures recorded', () => {
      expect(circuitBreaker.isAllowed('instance-1')).toBe(true);
    });

    it('should be closed initially', () => {
      expect(circuitBreaker.isOpen('instance-1')).toBe(false);
    });

    it('should open after failureThreshold failures', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      expect(circuitBreaker.isOpen('instance-1')).toBe(true);
      expect(circuitBreaker.isAllowed('instance-1')).toBe(false);
    });

    it('should not open below failureThreshold', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      expect(circuitBreaker.isOpen('instance-1')).toBe(false);
      expect(circuitBreaker.isAllowed('instance-1')).toBe(true);
    });

    it('should transition to HALF_OPEN after cooldown period', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      expect(circuitBreaker.isAllowed('instance-1')).toBe(false);

      jest.advanceTimersByTime(30_000);

      expect(circuitBreaker.isAllowed('instance-1')).toBe(true);
    });

    it('should close on recordSuccess after HALF_OPEN', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      jest.advanceTimersByTime(30_000);

      circuitBreaker.isAllowed('instance-1');
      circuitBreaker.recordSuccess('instance-1');

      expect(circuitBreaker.isOpen('instance-1')).toBe(false);
      expect(circuitBreaker.isAllowed('instance-1')).toBe(true);
    });

    it('should reset failures on recordSuccess in CLOSED state', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordSuccess('instance-1');

      expect(circuitBreaker.isOpen('instance-1')).toBe(false);
    });

    it('should clear all state on clear()', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      expect(circuitBreaker.isOpen('instance-1')).toBe(true);

      circuitBreaker.clear();

      expect(circuitBreaker.isOpen('instance-1')).toBe(false);
    });

    it('should keep OPEN after another failure in HALF_OPEN', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      jest.advanceTimersByTime(30_000);

      circuitBreaker.isAllowed('instance-1');
      circuitBreaker.recordFailure('instance-1');

      expect(circuitBreaker.isOpen('instance-1')).toBe(true);
    });
  });

  describe('with stateStore', () => {
    let mockCache: jest.Mocked<IServiceCache>;

    beforeEach(() => {
      mockCache = createMockCache();
      circuitBreaker = new CircuitBreaker(3, 10_000, 30_000, mockCache, 2_000, 100, 5000);
    });

    it('should persist state on every failure', async () => {
      circuitBreaker.recordFailure('instance-1');

      expect(mockCache.setCircuitState).toHaveBeenCalledWith('instance-1', {
        failures: 1,
        lastFailureTime: expect.any(Number),
        state: 'CLOSED',
      });

      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      expect(mockCache.setCircuitState).toHaveBeenCalledWith('instance-1', {
        failures: 3,
        lastFailureTime: expect.any(Number),
        state: 'OPEN',
      });
    });

    it('should load state from store on loadFromStore', async () => {
      const persistedState: CircuitState = {
        failures: 5,
        lastFailureTime: Date.now() - 5000,
        state: 'OPEN',
      };
      mockCache.getCircuitState.mockResolvedValue(persistedState);

      await circuitBreaker.loadFromStore('instance-1');

      expect(circuitBreaker.isOpen('instance-1')).toBe(true);
    });

    it('should delete persisted state on recordSuccess', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      jest.advanceTimersByTime(30_000);
      circuitBreaker.isAllowed('instance-1');
      circuitBreaker.recordSuccess('instance-1');

      expect(mockCache.deleteCircuitState).toHaveBeenCalledWith('instance-1');
    });

    it('should delete persisted state on clear()', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordFailure('instance-1');

      circuitBreaker.clear();

      expect(mockCache.deleteCircuitState).toHaveBeenCalledWith('instance-1');
    });
  });

  describe('sweepStaleEntries', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(3, 10_000, 30_000);
    });

    it('should sweep entries older than MAX_ENTRY_AGE_MS in CLOSED state', () => {
      circuitBreaker.recordFailure('instance-1');
      circuitBreaker.recordSuccess('instance-1');

      jest.advanceTimersByTime(5 * 60_000 + 1000);
      jest.advanceTimersByTime(60_000);

      expect(circuitBreaker.isOpen('instance-1')).toBe(false);
    });
  });
});
