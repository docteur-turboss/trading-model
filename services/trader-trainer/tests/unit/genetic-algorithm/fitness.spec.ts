import { describe, expect, test } from '@jest/globals';
import { computeFitness, shapeReward } from '../../../src/core/genetic-algorithm/fitness';
import type { RewardShapingGenome } from '../../../src/core/genetic-algorithm/genome-types';

describe('Fitness - computeFitness', () => {
  const scores = [100, 120, 110, 130, 140];

  test('total_pnl should return mean of scores', () => {
    const result = computeFitness('total_pnl', scores);
    expect(result).toBe(120);
  });

  test('sharpe should return positive value for positive scores', () => {
    const result = computeFitness('sharpe', scores);
    expect(result).toBeGreaterThan(0);
  });

  test('sharpe should return 0 for constant scores', () => {
    const result = computeFitness('sharpe', [5, 5, 5]);
    expect(result).toBe(5);
  });

  test('sortino should return positive value for positive scores', () => {
    const result = computeFitness('sortino', scores);
    expect(result).toBeGreaterThan(0);
  });

  test('sortino should handle no negative returns', () => {
    const result = computeFitness('sortino', [10, 20, 30]);
    expect(result).toBeGreaterThan(0);
  });

  test('sortino should handle negative returns', () => {
    const result = computeFitness('sortino', [10, -5, 20, -3]);
    expect(Number.isFinite(result)).toBe(true);
  });

  test('calmar should return positive value', () => {
    const result = computeFitness('calmar', scores);
    expect(result).toBeGreaterThan(0);
  });

  test('calmar should handle drawdown correctly', () => {
    const result = computeFitness('calmar', [100, -50, 200, -100]);
    expect(Number.isFinite(result)).toBe(true);
  });

  test('composite should combine sharpe and sortino with mean', () => {
    const result = computeFitness('composite', scores);
    expect(result).toBeGreaterThan(0);
  });

  test('should return -Infinity for empty scores', () => {
    const result = computeFitness('sharpe', []);
    expect(result).toBe(-Infinity);
  });

  test('unknown type should return mean', () => {
    const result = computeFitness('unknown' as any, scores);
    expect(result).toBe(120);
  });
});

describe('Fitness - shapeReward', () => {
  const cfg: RewardShapingGenome = {
    clip: true,
    clipMin: -1,
    clipMax: 1,
    scale: true,
    scaleFactor: 2,
    normalize: false,
    sparse: false,
  };

  test('should scale and clip reward', () => {
    const result = shapeReward(5, cfg);
    expect(result).toBe(1);
  });

  test('should scale and clip negative reward', () => {
    const result = shapeReward(-5, cfg);
    expect(result).toBe(-1);
  });

  test('should not clip when clip is false', () => {
    const result = shapeReward(5, { ...cfg, clip: false });
    expect(result).toBe(10);
  });

  test('should not scale when scale is false', () => {
    const result = shapeReward(0.5, { ...cfg, scale: false });
    expect(result).toBe(0.5);
  });

  test('should return raw reward when neither scale nor clip', () => {
    const result = shapeReward(0.5, { ...cfg, scale: false, clip: false });
    expect(result).toBe(0.5);
  });
});
