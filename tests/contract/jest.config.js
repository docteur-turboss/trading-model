const { resolve } = require('path');

module.exports = {
  testEnvironment: 'node',
  roots: [resolve(__dirname)],
  testMatch: ['**/service-contracts.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, 'tsconfig.json') }],
  },
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true,
};
