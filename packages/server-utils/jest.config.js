/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  moduleNameMapper: {
    '^@trading-model/crypto/(.*)$': '<rootDir>/../crypto/src/$1',
    '^@trading-model/server-utils/(.*)$': '<rootDir>/src/$1',
    '^@trading-model/validation/(.*)$': '<rootDir>/../validation/src/$1',
    '^@trading-model/common/(.*)$': '<rootDir>/../common/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
      },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  passWithNoTests: true,
  maxWorkers: 10,
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 80,
			lines: 80,
			statements: 80,
		},
	},
};
