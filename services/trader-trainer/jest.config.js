const { workspaceModuleNameMapper } = require('../../scripts/jest-workspace-mapper.cjs');

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  modulePathIgnorePatterns: ['/dist/'],
  moduleNameMapper: {
    ...workspaceModuleNameMapper(__dirname),
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
