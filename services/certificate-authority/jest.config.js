/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/integration/',
  ],
  maxWorkers: 1,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  moduleNameMapper: {
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
    '^@trading-model/certificate-utils/(.*)$': '<rootDir>/../../packages/certificate-utils/src/$1',
  },
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
