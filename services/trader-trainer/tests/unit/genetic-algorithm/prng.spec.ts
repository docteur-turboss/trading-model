import { describe, expect, test } from '@jest/globals';
import { makePRNG } from '../../../src/core/genetic-algorithm/prng';

describe('PRNG - makePRNG', () => {
  test('should return a function', () => {
    const rng = makePRNG(42);
    expect(typeof rng).toBe('function');
  });

  test('should produce values in [0, 1)', () => {
    const rng = makePRNG(42);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  test('should produce deterministic output for same seed', () => {
    const rng1 = makePRNG(123);
    const rng2 = makePRNG(123);
    for (let i = 0; i < 50; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  test('should produce different output for different seeds', () => {
    const rng1 = makePRNG(123);
    const rng2 = makePRNG(456);
    let same = true;
    for (let i = 0; i < 10; i++) {
      if (rng1() !== rng2()) same = false;
    }
    expect(same).toBe(false);
  });
});
