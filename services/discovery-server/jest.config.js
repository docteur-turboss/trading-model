/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10,
    },
  },
};
