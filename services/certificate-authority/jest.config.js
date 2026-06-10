/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  maxWorkers: 1,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/app/index.ts', '!src/config/env.ts'],
  moduleNameMapper: {
    '^config/(.*)$': '<rootDir>/src/config/$1',
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
