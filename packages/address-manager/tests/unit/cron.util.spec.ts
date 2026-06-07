import { describe, it, expect } from '@jest/globals';
import { intervalMsToCron } from '../../src/scheduler/cron.util';

describe('intervalMsToCron', () => {
  it('should return */1 for intervals less than one minute', () => {
    expect(intervalMsToCron(30_000)).toBe('*/1 * * * *');
  });

  it('should return */5 for a 5-minute interval', () => {
    expect(intervalMsToCron(5 * 60_000)).toBe('*/5 * * * *');
  });

  it('should return */1 for intervals less than 1 millisecond', () => {
    expect(intervalMsToCron(0)).toBe('*/1 * * * *');
  });

  it('should return */1 for negative intervals', () => {
    expect(intervalMsToCron(-5000)).toBe('*/1 * * * *');
  });

  it('should round down fractional minutes', () => {
    expect(intervalMsToCron(125_000)).toBe('*/2 * * * *');
  });

  it('should handle large intervals', () => {
    expect(intervalMsToCron(120 * 60_000)).toBe('*/120 * * * *');
  });
});
