/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
    '^@trading-model/address-manager/(.*)$': '<rootDir>/../../packages/address-manager/src/$1',
    '^@trading-model/broker-message/(.*)$': '<rootDir>/../../packages/broker-message/src/$1',
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
