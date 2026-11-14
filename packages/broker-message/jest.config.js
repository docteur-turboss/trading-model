const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, { coverageThreshold: { branches: 75 } });
