const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, {
  // Process wiring (bootstrap, server, container): exercised by the E2E and k8s jobs.
  coveragePathIgnorePatterns: ['/node_modules/', 'src/application/(index|server|telemetry)\.ts', 'src/config/container\.ts'],
});
