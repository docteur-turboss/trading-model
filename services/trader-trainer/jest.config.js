const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, {
  modulePathIgnorePatterns: ['/dist/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Runs in a worker thread that Jest does not instrument (exercised by worker-training-runner.spec.ts).
    '!src/adapters/outbound/training-worker/training-worker.ts',
  ],
});
