const { dbJestConfig } = require('../../scripts/jest-db-config.cjs');
const baseConfig = require('./jest.config.js');

// One worker: both specs run migrate.mjs on the same database (`_migrations`).
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  ...dbJestConfig(
    { ...baseConfig, setupFiles: ['./tests/db/db-env.setup.ts'] },
    { databases: ['mysql'] }
  ),
  maxWorkers: 1,
};
