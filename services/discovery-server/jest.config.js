const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, { moduleNameMapper: { '^config/(.*)$': '<rootDir>/src/config/$1' } });
