const { resolve } = require('node:path');
const { workspaceModuleNameMapper } = require('../../scripts/jest-workspace-mapper.cjs');

module.exports = {
  testEnvironment: 'node',
  roots: [resolve(__dirname)],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\.ts$': [
      'ts-jest',
      {
        tsconfig: resolve(__dirname, 'tsconfig.json'),
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    ...workspaceModuleNameMapper(__dirname),
  },
  testTimeout: 30000,
};
