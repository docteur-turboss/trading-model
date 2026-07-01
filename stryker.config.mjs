const config = {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  packageManager: 'npm',
  testRunner: 'jest',
  checkers: ['typescript'],
  concurrency: 4,
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress'],
  tempDirName: 'stryker-tmp',
  cleanTempDir: true,
  thresholds: { high: 80, low: 60, break: null },
};

export default config;
