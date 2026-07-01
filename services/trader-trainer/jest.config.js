const { createDefaultPreset } = require('ts-jest');

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
  },
  transform: {
    ...tsJestTransformCfg,
  },
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10,
    },
  },
};
