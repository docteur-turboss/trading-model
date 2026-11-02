const config = {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  packageManager: 'bun',
  testRunner: 'jest',
  plugins: ['@stryker-mutator/jest-runner', '@stryker-mutator/typescript-checker'],
  checkers: ['typescript'],
  concurrency: 4,
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress'],
  tempDirName: 'stryker-tmp',
  cleanTempDir: true,
  thresholds: { high: 80, low: 60, break: 50 },
};

export default config;
