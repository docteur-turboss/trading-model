/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  maxWorkers: 3,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^@trading-model/crypto/(.*)$': '<rootDir>/../crypto/src/$1',
    '^@trading-model/validation/(.*)$': '<rootDir>/../validation/src/$1',
    '^@trading-model/server-utils/(.*)$': '<rootDir>/../server-utils/src/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../common/src/$1',
    '^@trading-model/certificate-utils/types$': '<rootDir>/../certificate-utils/src/keygen/types',
    '^@trading-model/certificate-utils/generate-key-pair$': '<rootDir>/../certificate-utils/src/keygen/generate-key-pair',
    '^@trading-model/certificate-utils/sign-certificate$': '<rootDir>/../certificate-utils/src/signing/sign-certificate',
    '^@trading-model/certificate-utils/validate-certificate$': '<rootDir>/../certificate-utils/src/validation/validate-certificate',
    '^@trading-model/certificate-utils/async$': '<rootDir>/../certificate-utils/src/workers/async',
    '^@trading-model/certificate-utils/(.*)$': '<rootDir>/../certificate-utils/src/$1',
    '^@trading-model/broker-message$': '<rootDir>/../broker-message/src/index.ts',
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
