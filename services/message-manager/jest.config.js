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
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@trading-model/common/tests/(.*)$': '<rootDir>/../../packages/common/tests/$1',
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^messaging$': '<rootDir>/src/messaging/index.ts',
    '^messaging/(.*)$': '<rootDir>/src/messaging/$1',
  },
};
