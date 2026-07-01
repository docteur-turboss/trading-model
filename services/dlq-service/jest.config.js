/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['./jest.setup.ts'],
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/app/**/*.ts'],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10,
    },
  },
  moduleNameMapper: {
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^dlq/(.*)$': '<rootDir>/src/dlq/$1',
  },
};
