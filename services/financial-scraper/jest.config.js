/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false,
    }],
  },
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^@trading-model/crypto/(.*)$': '<rootDir>/../../packages/crypto/src/$1',
    '^@trading-model/validation/(.*)$': '<rootDir>/../../packages/validation/src/$1',
    '^@trading-model/server-utils/(.*)$': '<rootDir>/../../packages/server-utils/src/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
    '^infra/(.*)$': '<rootDir>/src/infra/$1',
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^clients/(.*)$': '<rootDir>/src/clients/$1',
    '^job/(.*)$': '<rootDir>/src/job/$1',
    '^types/(.*)$': '<rootDir>/src/types/$1',
    '^utils/(.*)$': '<rootDir>/src/utils/$1',
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
