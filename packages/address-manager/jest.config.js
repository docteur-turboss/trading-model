/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec).ts'],
  moduleNameMapper: {
    '^@trading-model/common/(.*)$': '<rootDir>/../common/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
