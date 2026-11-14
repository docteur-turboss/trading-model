const { jestConfig } = require('../../scripts/jest-base.cjs');
module.exports = jestConfig(__dirname, {
  // Jest runs CommonJS: compile the specs to CommonJS rather than the
  // hybrid node16 output (ts-jest TS151002), so import() becomes require().
  tsJest: { tsconfig: { skipLibCheck: true, module: 'commonjs', moduleResolution: 'bundler' } },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  // Process wiring (bootstrap, server, container, env): exercised by the E2E and k8s jobs.
  coveragePathIgnorePatterns: ['/node_modules/', 'src/application/(index|server|telemetry)\.ts', 'src/config/', 'src/infrastructure/config/'],
});
