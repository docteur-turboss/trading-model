/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
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
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};
