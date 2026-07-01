import { describe, it, expect } from '@jest/globals';

import { CircuitBreaker } from '../../src/reliability/circuit-breaker';

describe('CircuitBreaker', () => {
  it('starts in closed state for any key', () => {
    const cb = new CircuitBreaker();
    expect(cb.check('svc-a')).toBe('closed');
  });

  it('opens after exceeding failure threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60000 });

    expect(cb.check('svc-a')).toBe('closed');
    cb.recordFailure('svc-a');
    expect(cb.check('svc-a')).toBe('closed');
    cb.recordFailure('svc-a');
    expect(cb.check('svc-a')).toBe('closed');
    cb.recordFailure('svc-a');
    expect(cb.check('svc-a')).toBe('open');
  });

  it('closes again after recordSuccess', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });

    cb.recordFailure('svc-a');
    expect(cb.check('svc-a')).toBe('open');

    cb.recordSuccess('svc-a');
    expect(cb.check('svc-a')).toBe('closed');
  });

  it('uses default config when no options provided', () => {
    const cb = new CircuitBreaker();

    expect(cb.check('svc')).toBe('closed');
    for (let i = 0; i < 5; i++) {
      cb.recordFailure('svc');
    }
    expect(cb.check('svc')).toBe('open');
  });

  it('tracks keys independently', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 60000 });

    cb.recordFailure('svc-a');
    cb.recordFailure('svc-a');
    expect(cb.check('svc-a')).toBe('open');
    expect(cb.check('svc-b')).toBe('closed');
  });

  it('transitions to half-open after cooldown', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10 });

    cb.recordFailure('svc-a');
    expect(cb.check('svc-a')).toBe('open');

    await new Promise(r => setTimeout(r, 15));
    expect(cb.check('svc-a')).toBe('half-open');
  });
});
