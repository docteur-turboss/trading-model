/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@trading-model/crypto/(.*)$': '<rootDir>/../../packages/crypto/src/$1',
    '^@trading-model/validation/(.*)$': '<rootDir>/../../packages/validation/src/$1',
    '^@trading-model/server-utils/(.*)$': '<rootDir>/../../packages/server-utils/src/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../../packages/common/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
      },
    ],
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
