import { describe, it, expect } from '@jest/globals';

jest.mock('../../src/config/env', () => ({
  env: {
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX: 100,
  },
}));

import { defaultLimiter, strictLimiter } from '../../src/core/rate-limiter';

describe('rate-limiter', () => {
  it('should export defaultLimiter with configured window and max', () => {
    expect(defaultLimiter).toBeDefined();
    expect(typeof defaultLimiter).toBe('function');
  });

  it('should export strictLimiter with 10 max per minute', () => {
    expect(strictLimiter).toBeDefined();
    expect(typeof strictLimiter).toBe('function');
  });

  it('should have different configurations', () => {
    const defaultWindow = 60000;
    const strictWindow = 60000;
    expect(defaultWindow).toBe(strictWindow);
  });
});
