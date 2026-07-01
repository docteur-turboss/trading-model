import { describe, it, expect } from '@jest/globals';

import { CircuitBreaker, CircuitBreakerOpenError } from '../../src/reliability/circuit-breaker';

describe('CircuitBreaker', () => {
  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    expect(cb.getState()).toBe('CLOSED');
  });

  it('passes through successful calls', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const result = await cb.call(async () => 'ok');
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('opens after exceeding max failures', async () => {
    const cb = new CircuitBreaker({ name: 'test', maxFailures: 2, resetTimeoutMs: 60000 });
    const fn = async () => { throw new Error('fail'); };

    await expect(cb.call(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('CLOSED');

    await expect(cb.call(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('OPEN');

    await expect(cb.call(fn)).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('transitions to HALF_OPEN after reset timeout', async () => {
    const cb = new CircuitBreaker({ name: 'test', maxFailures: 1, resetTimeoutMs: 50 });
    const failFn = async () => { throw new Error('fail'); };

    await expect(cb.call(failFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('OPEN');

    await new Promise(r => setTimeout(r, 60));

    const successFn = async () => 'recovered';
    const result = await cb.call(successFn);
    expect(result).toBe('recovered');
  });

  it('closes after success threshold in HALF_OPEN', async () => {
    const cb = new CircuitBreaker({
      name: 'test',
      maxFailures: 1,
      resetTimeoutMs: 50,
      successThreshold: 2,
    });
    const failFn = async () => { throw new Error('fail'); };

    await expect(cb.call(failFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('OPEN');

    await new Promise(r => setTimeout(r, 60));

    await cb.call(async () => 'first');
    expect(cb.getState()).toBe('HALF_OPEN');

    await cb.call(async () => 'second');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('re-opens if a call fails in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker({ name: 'test', maxFailures: 1, resetTimeoutMs: 50 });
    const failFn = async () => { throw new Error('fail'); };

    await expect(cb.call(failFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('OPEN');

    await new Promise(r => setTimeout(r, 60));

    await expect(cb.call(failFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('OPEN');
  });

  it('provides metrics', () => {
    const cb = new CircuitBreaker({ name: 'test-metrics' });
    const metrics = cb.getMetrics();
    expect(metrics.name).toBe('test-metrics');
    expect(metrics.state).toBe('CLOSED');
    expect(metrics.failures).toBe(0);
    expect(metrics.bucket.failures).toBe(0);
    expect(metrics.bucket.successes).toBe(0);
  });
});
