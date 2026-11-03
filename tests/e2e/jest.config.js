module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.e2e.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testTimeout: 30000,
  // Suites share one live stack and resilience.e2e restarts services: run serially.
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: true,
};
