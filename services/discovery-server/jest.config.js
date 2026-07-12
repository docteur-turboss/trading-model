/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^@trading-model/crypto/(.*)$': '<rootDir>/../../packages/crypto/src/$1',
    '^@trading-model/validation/(.*)$': '<rootDir>/../../packages/validation/src/$1',
    '^@trading-model/server-utils/(.*)$': '<rootDir>/../../packages/server-utils/src/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
      },
    ],
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
