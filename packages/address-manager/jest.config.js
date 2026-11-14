const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, { maxWorkers: 10 });
