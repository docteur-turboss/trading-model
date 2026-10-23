/** Stops the containers started by `jest-db-global-setup.cjs`. */
module.exports = async function globalTeardown() {
  await Promise.all((globalThis.__TEST_DB_CONTAINERS__ ?? []).map((container) => container.stop()));
};
