const { dbJestConfig } = require('../../scripts/jest-db-config.cjs');
const baseConfig = require('./jest.config.js');

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = dbJestConfig(
  { ...baseConfig, setupFiles: [...baseConfig.setupFiles, './tests/db/db-env.setup.ts'] },
  { databases: ['mongo'] }
);
