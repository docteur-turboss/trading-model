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
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
