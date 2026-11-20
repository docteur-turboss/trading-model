const { DB_SPEC_IGNORE } = require('./jest-db-config.cjs');
const { workspaceModuleNameMapper } = require('./jest-workspace-mapper.cjs');

const THRESHOLDS = { branches: 80, functions: 80, lines: 80, statements: 80 };

/**
 * Jest config shared by every workspace. `overrides` replaces top-level keys,
 * except `moduleNameMapper` (added to the workspace mapper), `coverageThreshold`
 * (merged into the 80 % global thresholds) and `tsJest` (options of the ts-jest transform).
 */
function jestConfig(dir, { moduleNameMapper, coverageThreshold, tsJest, ...overrides } = {}) {
  return {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['**/?(*.)+(spec).ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/', DB_SPEC_IGNORE],
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
    transform: { '^.+\\.tsx?$': ['ts-jest', { diagnostics: false, ...tsJest }] },
    moduleNameMapper: { ...workspaceModuleNameMapper(dir), ...moduleNameMapper },
    coverageThreshold: { global: { ...THRESHOLDS, ...coverageThreshold } },
    // `bun run --filter '*' test` runs up to 8 workspaces at once: more workers starve the 4-vCPU CI runner (issue #1653).
    maxWorkers: '50%',
    ...overrides,
  };
}

module.exports = { jestConfig };
