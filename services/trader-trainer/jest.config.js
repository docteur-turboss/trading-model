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
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};
