import { jest } from '@jest/globals';

/** Pre-configured mock logger for tests that need a logger. */
export function createMockLogger() {
  return {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

/** Pre-configured mock env object for discovery-server tests. */
export function createMockDiscoveryEnv(overrides?: Record<string, unknown>) {
  return {
    env: {
      CLEANUP_SERVICE_INTERVAL_MS: 5000,
      ERROR_URL_WEBHOOK: 'https://hooks.example.com/error',
      ...overrides,
    },
  };
}

/** Utility mock object for axios-based http clients. */
export function createMockHttpClient() {
  return {
    get: jest
      .fn<(...args: unknown[]) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} }),
    post: jest
      .fn<(...args: unknown[]) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} }),
    put: jest
      .fn<(...args: unknown[]) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} }),
    delete: jest
      .fn<(...args: unknown[]) => Promise<{ data: unknown }>>()
      .mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: {},
  };
}
