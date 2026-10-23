/**
 * Jest globalSetup for database-backed specs: starts the containers listed in
 * the project's `globals.__TEST_DATABASES__` (see `jest-db-config.cjs`) and
 * exports their connection strings as env vars, which the test workers inherit.
 *
 * Images are read from docker-compose.yml so tests and the stack never drift.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { MongoDBContainer } = require('@testcontainers/mongodb');
const { MySqlContainer } = require('@testcontainers/mysql');
const { RedisContainer } = require('@testcontainers/redis');

const COMPOSE_FILE = join(__dirname, '..', 'docker-compose.yml');

function composeImage(service) {
  const lines = readFileSync(COMPOSE_FILE, 'utf8').split(/\r?\n/);
  const start = lines.indexOf(`  ${service}:`);
  for (let i = start + 1; start !== -1 && i < lines.length && /^ {4}|^$/.test(lines[i]); i++) {
    const match = lines[i].match(/^ {4}image:\s*(\S+)/);
    if (match) return match[1];
  }
  throw new Error(`No image found for service "${service}" in ${COMPOSE_FILE}`);
}

// The module's own health check picks the legacy `mongo` shell when the image
// has no semver tag (compose pins digests), so initiate the replica set here.
const MONGO_RS_HEALTHCHECK =
  "mongosh --quiet --eval 'try { rs.status(); } catch (e) { rs.initiate(); } while (!db.hello().isWritablePrimary) { sleep(100); }'";

const STARTERS = {
  async mongo() {
    const container = await new MongoDBContainer(composeImage('mongo'))
      .withHealthCheck({ test: ['CMD-SHELL', MONGO_RS_HEALTHCHECK], interval: 1000, timeout: 60000, retries: 120 })
      .start();
    return { container, env: { TEST_MONGO_URI: `${container.getConnectionString()}/?directConnection=true` } };
  },
  async redis() {
    const container = await new RedisContainer(composeImage('redis')).start();
    return { container, env: { TEST_REDIS_URL: container.getConnectionUrl() } };
  },
  async mysql() {
    const container = await new MySqlContainer(composeImage('mysql')).start();
    return { container, env: { TEST_MYSQL_URI: container.getConnectionUri() } };
  },
};

module.exports = async function globalSetup(_globalConfig, projectConfig) {
  const databases = projectConfig.globals.__TEST_DATABASES__ ?? [];
  const started = await Promise.all(databases.map((db) => STARTERS[db]()));
  globalThis.__TEST_DB_CONTAINERS__ = started.map(({ container }) => container);
  for (const { env } of started) Object.assign(process.env, env);
};
