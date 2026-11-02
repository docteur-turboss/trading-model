/**
 * Jest config for database-backed specs (`tests/db/**\/*.db.spec.ts`).
 *
 * These specs run against real MongoDB / Redis / MySQL instances started by
 * Testcontainers in `jest-db-global-setup.cjs`, using the same images that
 * docker-compose.yml pins. Connection strings reach the specs through
 * environment variables:
 *
 *   mongo → TEST_MONGO_URI   (single-node replica set, directConnection)
 *   redis → TEST_REDIS_URL
 *   mysql → TEST_MYSQL_URI   (non-root user, database `test`)
 *
 * They are kept out of the default `jest` run (and so out of pre-push) by
 * adding `DB_SPEC_IGNORE` to the workspace's `testPathIgnorePatterns`, and run
 * with the workspace script:
 *
 *   "test:db": "NODE_OPTIONS=--experimental-vm-modules jest -c jest.db.config.js"
 *
 * The flag is required: the mongodb driver loads `os` through a dynamic
 * `import()`, which Jest's vm sandbox rejects otherwise, and the handshake then
 * goes out without its `driver` metadata (server error "Missing required
 * sub-document 'driver'").
 */
const DATABASES = ['mongo', 'redis', 'mysql'];

const DB_SPEC_IGNORE = '\\.db\\.spec\\.ts$';

function dbJestConfig(baseConfig, { databases }) {
  const unknown = databases.filter((db) => !DATABASES.includes(db));
  if (databases.length === 0 || unknown.length > 0) {
    throw new Error(`dbJestConfig: expected databases from ${DATABASES.join(', ')}, got ${databases.join(', ')}`);
  }

  const { coverageThreshold: _coverageThreshold, passWithNoTests: _passWithNoTests, ...rest } = baseConfig;
  return {
    ...rest,
    testMatch: ['<rootDir>/tests/db/**/*.db.spec.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    globalSetup: require.resolve('./jest-db-global-setup.cjs'),
    globalTeardown: require.resolve('./jest-db-global-teardown.cjs'),
    globals: { ...rest.globals, __TEST_DATABASES__: databases },
    testTimeout: 60000,
    forceExit: true,
    detectOpenHandles: true,
  };
}

module.exports = { dbJestConfig, DB_SPEC_IGNORE };
