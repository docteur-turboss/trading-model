const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, {
  modulePathIgnorePatterns: ['/dist/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Runs in a worker thread that Jest does not instrument (exercised by worker-training-runner.spec.ts).
    '!src/adapters/outbound/training-worker/training-worker.ts',
  ],
  // Process wiring (bootstrap, server, container): exercised by the E2E and k8s jobs.
  coveragePathIgnorePatterns: ['/node_modules/', 'src/application/(index|server|telemetry)\.ts', 'src/config/container\.ts'],
});
