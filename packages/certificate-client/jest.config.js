/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  maxWorkers: 3,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^@trading-model/common/(.*)$': '<rootDir>/../common/src/$1',
    '^@trading-model/certificate-utils/(.*)$': '<rootDir>/../certificate-utils/src/$1',
    '^@trading-model/broker-message$': '<rootDir>/../broker-message/src/index.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
