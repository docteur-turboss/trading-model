const { dbJestConfig } = require('../../scripts/jest-db-config.cjs');
const baseConfig = require('./jest.config.js');

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = dbJestConfig(baseConfig, { databases: ['mongo', 'redis'] });
