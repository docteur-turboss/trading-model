const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, {
  // Jest runs CommonJS: compile the specs to CommonJS rather than the
  // hybrid node16 output (ts-jest TS151002), so import() becomes require().
  tsJest: { tsconfig: { module: 'commonjs', moduleResolution: 'bundler' } },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^config/(.*)$': '<rootDir>/src/config/$1',
  },
});
