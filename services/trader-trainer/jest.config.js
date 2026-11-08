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
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Runs in a worker thread that Jest does not instrument (exercised by worker-training-runner.spec.ts).
    '!src/adapters/outbound/training-worker/training-worker.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
