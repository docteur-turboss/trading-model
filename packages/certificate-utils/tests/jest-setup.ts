import { jest } from '@jest/globals';

jest.mock('node:worker_threads', () => {
  const FakeWorker = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    postMessage: jest.fn(),
    terminate: jest.fn(),
    removeAllListeners: jest.fn(),
  }));
  return {
    Worker: FakeWorker,
    parentPort: {
      on: jest.fn(),
      postMessage: jest.fn(),
    },
  };
});

jest.mock('node:os', () => ({
  availableParallelism: jest.fn(() => 2),
}));
