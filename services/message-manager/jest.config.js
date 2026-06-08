/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['./jest.setup.ts'],
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  moduleNameMapper: {
    '^@trading-model/common/tests/(.*)$': '<rootDir>/../../packages/common/tests/$1',
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^messaging$': '<rootDir>/src/messaging/index.ts',
    '^messaging/(.*)$': '<rootDir>/src/messaging/$1',
  },
};
