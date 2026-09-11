const { resolve } = require('node:path');

module.exports = {
  testEnvironment: 'node',
  roots: [resolve(__dirname)],
  testMatch: ['**/service-contracts.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: resolve(__dirname, 'tsconfig.json'),
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    '^@trading-model/([^/]+)/(.*)$': '<rootDir>/../../packages/$1/src/$2',
    '^@trading-model/([^/]+)$': '<rootDir>/../../packages/$1/src/index.ts',
  },
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true,
};