const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, {
  setupFiles: ['./jest.setup.ts'],
  coverageThreshold: { branches: 79 },
  moduleNameMapper: { '^config/(.*)$': '<rootDir>/src/config/$1' },
});
