const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, { passWithNoTests: true, testTimeout: 60_000 });
