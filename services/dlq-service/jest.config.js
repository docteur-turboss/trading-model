/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['./jest.setup.ts'],
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/app/**',
    '!src/config/db.ts',
    '!src/config/audit.ts',
    '!src/config/address-manager.ts',
    '!src/config/logger.ts',
    '!src/config/env.ts',
    '!src/config/metrics.ts',
    '!src/config/redis-queue.ts',
    '!src/domain/**',
    '!src/dlq/controller.ts',
    '!src/dlq/routes.ts',
    '!src/dlq/repository.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^dlq/(.*)$': '<rootDir>/src/dlq/$1',
  },
};
