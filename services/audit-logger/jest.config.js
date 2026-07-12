/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false,
      tsconfig: {
        skipLibCheck: true,
      },
    }],
  },
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@trading-model/crypto/(.*)$': '<rootDir>/../../packages/crypto/src/$1',
    '^@trading-model/validation/(.*)$': '<rootDir>/../../packages/validation/src/$1',
    '^@trading-model/server-utils/(.*)$': '<rootDir>/../../packages/server-utils/src/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
    '^@trading-model/address-manager/(.*)$': '<rootDir>/../../packages/address-manager/src/$1',
    '^@trading-model/broker-message$': '<rootDir>/../../packages/broker-message/src/index.ts',
    '^@trading-model/broker-message/(.*)$': '<rootDir>/../../packages/broker-message/src/$1',
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
