const { DB_SPEC_IGNORE } = require('../../scripts/jest-db-config.cjs');
const { workspaceModuleNameMapper } = require('../../scripts/jest-workspace-mapper.cjs');

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false,
      // Jest runs CommonJS: compile the specs to CommonJS rather than the
      // hybrid node16 output (ts-jest TS151002), so import() becomes require().
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'bundler',
      },
    }],
  },
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', DB_SPEC_IGNORE],
  moduleNameMapper: {
    ...workspaceModuleNameMapper(__dirname),
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^config/(.*)$': '<rootDir>/src/config/$1',
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
