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
    '^@trading-model/crypto/(.*)$': '<rootDir>/../../packages/crypto/src/$1',
    '^@trading-model/validation/(.*)$': '<rootDir>/../../packages/validation/src/$1',
    '^@trading-model/server-utils/(.*)$': '<rootDir>/../../packages/server-utils/src/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
    '^@trading-model/certificate-utils/types$': '<rootDir>/../../packages/certificate-utils/src/keygen/types',
    '^@trading-model/certificate-utils/generate-key-pair$': '<rootDir>/../../packages/certificate-utils/src/keygen/generate-key-pair',
    '^@trading-model/certificate-utils/sign-certificate$': '<rootDir>/../../packages/certificate-utils/src/signing/sign-certificate',
    '^@trading-model/certificate-utils/validate-certificate$': '<rootDir>/../../packages/certificate-utils/src/validation/validate-certificate',
    '^@trading-model/certificate-utils/async$': '<rootDir>/../../packages/certificate-utils/src/workers/async',
    '^@trading-model/certificate-utils/(.*)$': '<rootDir>/../../packages/certificate-utils/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
      },
    ],
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
