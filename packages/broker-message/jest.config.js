/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  moduleNameMapper: {
    '^@trading-model/crypto/(.*)$': '<rootDir>/../crypto/src/$1',
    '^@trading-model/validation/(.*)$': '<rootDir>/../validation/src/$1',
    '^@trading-model/server-utils/(.*)$': '<rootDir>/../server-utils/src/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../common/src/$1',
    '^@trading-model/address-manager$': '<rootDir>/../address-manager/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
      },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
