import { describe, expect, test } from '@jest/globals';
import {
  clamp,
  generateId,
  RunningStats,
  computeVariance,
  computeSharpe,
} from '../../../src/core/genetic-algorithm/utils';

describe('Utils - clamp', () => {
  test('should clamp value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('should clamp below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('should clamp above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test('should handle edge values', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('Utils - generateId', () => {
  test('should return a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  test('should return different ids on successive calls', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });
});

describe('Utils - RunningStats', () => {
  test('should have default std of 1 and mu of 0', () => {
    const stats = new RunningStats();
    expect(stats.std).toBe(1);
    expect(stats.mu).toBe(0);
  });

  test('should compute mean and std correctly', () => {
    const stats = new RunningStats();
    stats.update(1);
    stats.update(2);
    stats.update(3);

    expect(stats.mu).toBe(2);
    expect(stats.std).toBeGreaterThan(0);
  });

  test('should normalize values', () => {
    const stats = new RunningStats();
    stats.update(0);
    stats.update(10);

    const normalized = stats.normalize(5);
    expect(Number.isFinite(normalized)).toBe(true);
  });

  test('should handle single value normalization', () => {
    const stats = new RunningStats();
    stats.update(5);

    const normalized = stats.normalize(10);
    expect(Number.isFinite(normalized)).toBe(true);
  });
});

describe('Utils - computeVariance', () => {
  test('should return 0 for fewer than 2 elements', () => {
    expect(computeVariance([1])).toBe(0);
    expect(computeVariance([])).toBe(0);
  });

  test('should compute variance correctly', () => {
    const variance = computeVariance([1, 2, 3, 4, 5]);
    expect(variance).toBe(2.5);
  });

  test('should return 0 for constant array', () => {
    expect(computeVariance([5, 5, 5])).toBe(0);
  });
});

describe('Utils - computeSharpe', () => {
  test('should return 0 for fewer than 2 elements', () => {
    expect(computeSharpe([1])).toBe(0);
    expect(computeSharpe([])).toBe(0);
  });

  test('should return 0 for zero standard deviation', () => {
    expect(computeSharpe([5, 5, 5])).toBe(0);
  });

  test('should compute positive sharpe for positive mean', () => {
    const sharpe = computeSharpe([1, 2, 3]);
    expect(sharpe).toBeGreaterThan(0);
  });
});
