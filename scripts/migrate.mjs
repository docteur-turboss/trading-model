#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = existsSync(join(SCRIPT_DIR, 'migrations'))
  ? join(SCRIPT_DIR, 'migrations')
  : SCRIPT_DIR;
const MIGRATIONS_TABLE = '_migrations';
const STEPS_TABLE = '_migration_steps';
// Server-wide named lock (ADR-0040): a second `up`/`down` waits for the first, then fails.
const LOCK_NAME = 'schema_migrations';
const LOCK_TIMEOUT_SECONDS = 120;

const [, , command, ...restArgs] = process.argv;

if (!command || !['up', 'down', 'status', 'create'].includes(command)) {
  console.error('Usage: bun scripts/migrate.mjs <up|down|status|create> [name]');
  process.exit(1);
}

if (command === 'create') {
  const name = process.argv[3];
  if (!name) {
    console.error('Usage: bun scripts/migrate.mjs create <migration_name>');
    process.exit(1);
  }
  const timestamp = Date.now();
  const upFile = join(MIGRATIONS_DIR, `${timestamp}_${name}.up.sql`);
  const downFile = join(MIGRATIONS_DIR, `${timestamp}_${name}.down.sql`);
  writeFileSync(upFile, `-- Migration: ${name}\n-- Up\n\n`);
  writeFileSync(downFile, `-- Migration: ${name}\n-- Down\n\n`);
  console.log(`Created ${upFile}`);
  console.log(`Created ${downFile}`);
  process.exit(0);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function getChecksum(filePath) {
  return sha256(readFileSync(filePath, 'utf8'));
}

/**
 * Splits a migration file into its statements on the `;` that are outside
 * quotes, backticks and comments. Comment-only chunks are dropped. Stored
 * programs (DELIMITER, BEGIN ... END bodies) are not supported.
 *
 * @param {string} sql
 * @returns {string[]}
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let hasCode = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== c) j += sql[j] === '\\' && c !== '`' ? 2 : 1;
      current += sql.slice(i, j + 1);
      i = j;
      hasCode = true;
    } else if (c === '#' || (c === '-' && next === '-' && /\s/.test(sql[i + 2] ?? '\n'))) {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      current += sql.slice(i, stop);
      i = stop - 1;
    } else if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw new Error('Unterminated /* comment');
      current += sql.slice(i, end + 2);
      i = end + 1;
    } else if (c === ';') {
      if (hasCode) statements.push(current.trim());
      current = '';
      hasCode = false;
    } else {
      current += c;
      if (!/\s/.test(c)) hasCode = true;
    }
  }
  if (hasCode) statements.push(current.trim());
  if (statements.some(statement => /^\s*DELIMITER\b/im.test(statement))) {
    throw new Error('DELIMITER is not supported: write one plain statement per `;`');
  }
  return statements;
}

/**
 * Runs the statements of one migration file one by one, journaling each in
 * `_migration_steps` in the same transaction as the statement (atomic for
 * DML; DDL commits on its own, so a crash between a DDL and its journal row
 * is the one window left). A rerun resumes after the last journaled statement
 * and refuses a file whose already-run statements changed.
 *
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} id migration id
 * @param {'up' | 'down'} direction
 * @param {string} file path of the .up.sql / .down.sql file
 */
async function runSteps(connection, id, direction, file) {
  const statements = splitStatements(readFileSync(file, 'utf8'));
  const [done] = await connection.execute(
    `SELECT step, checksum FROM \`${STEPS_TABLE}\` WHERE migration_id = ? AND direction = ? ORDER BY step`,
    [id, direction]
  );
  done.forEach((row, i) => {
    if (row.step !== i || row.checksum !== sha256(statements[i] ?? '')) {
      throw new Error(
        `${id} (${direction}): statement ${i + 1} already ran but is no longer the same in ${file}; ` +
          'restore it, only the statements after it may change'
      );
    }
  });
  if (done.length > 0) {
    console.log(`  resuming at statement ${done.length + 1}/${statements.length}`);
  }
  for (let i = done.length; i < statements.length; i++) {
    await connection.beginTransaction();
    try {
      await connection.query(statements[i]);
      await connection.execute(
        `INSERT INTO \`${STEPS_TABLE}\` (migration_id, direction, step, checksum) VALUES (?, ?, ?, ?)`,
        [id, direction, i, sha256(statements[i])]
      );
      await connection.commit();
    } catch (err) {
      await connection.rollback().catch(rollbackErr => {
        err.message += ` (rollback failed: ${rollbackErr.message})`;
      });
      throw new Error(
        `${id} (${direction}) statement ${i + 1}/${statements.length} failed: ${err.message}; ` +
          'fix it and rerun, the statements before it are not replayed',
        { cause: err }
      );
    }
  }
}

/**
 * Records the migration as applied (up) or removed (down) and clears its
 * step journal, in one transaction.
 */
async function finish(connection, id, direction, checksum, duration) {
  await connection.beginTransaction();
  try {
    if (direction === 'up') {
      await connection.execute(
        `INSERT INTO \`${MIGRATIONS_TABLE}\` (id, name, checksum, duration_ms) VALUES (?, ?, ?, ?)`,
        [id, id, checksum, duration]
      );
    } else {
      await connection.execute(`DELETE FROM \`${MIGRATIONS_TABLE}\` WHERE id = ?`, [id]);
    }
    await connection.execute(
      `DELETE FROM \`${STEPS_TABLE}\` WHERE migration_id = ? AND direction = ?`,
      [id, direction]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback().catch(rollbackErr => {
      err.message += ` (rollback failed: ${rollbackErr.message})`;
    });
    throw err;
  }
}

/**
 * @returns {{ host: string, port: number, user: string, password: string, database: string }}
 */
function getDbConfig() {
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // DB_SSL_CA: verify the server certificate and host name (ADR-0060).
    ...(process.env.DB_SSL_CA ? { ssl: { ca: readFileSync(process.env.DB_SSL_CA, 'utf8') } } : {}),
  };
}

const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const env of required) {
  if (!process.env[env]) {
    console.error(`Missing required env var: ${env}`);
    process.exit(1);
  }
}

if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const allMigrations = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.up.sql'))
  .map(f => ({
    id: f.replace(/\.up\.sql$/, ''),
    up: join(MIGRATIONS_DIR, f),
    down: join(MIGRATIONS_DIR, f.replace(/\.up\.sql$/, '.down.sql')),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

async function migrate(connection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
      \`id\`          VARCHAR(255) NOT NULL PRIMARY KEY,
      \`name\`        VARCHAR(255) NOT NULL,
      \`applied_at\`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`checksum\`    VARCHAR(64) NOT NULL,
      \`duration_ms\` INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`${STEPS_TABLE}\` (
      \`migration_id\` VARCHAR(255) NOT NULL,
      \`direction\`    ENUM('up', 'down') NOT NULL,
      \`step\`         INT NOT NULL,
      \`checksum\`     VARCHAR(64) NOT NULL,
      \`applied_at\`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`migration_id\`, \`direction\`, \`step\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [rows] = await connection.execute(
    `SELECT id, checksum FROM \`${MIGRATIONS_TABLE}\` ORDER BY id ASC`
  );
  const applied = new Map(rows.map(r => [r.id, r.checksum]));
  const [partialRows] = await connection.execute(
    `SELECT DISTINCT migration_id, direction FROM \`${STEPS_TABLE}\` ORDER BY migration_id`
  );

  if (command === 'status') {
    const partial = new Set(partialRows.map(r => r.migration_id));
    console.log('\nMigration Status:');
    console.log('='.repeat(80));
    for (const m of allMigrations) {
      const checksum = applied.get(m.id);
      const status = partial.has(m.id)
        ? 'PARTIAL '
        : checksum
          ? checksum === getChecksum(m.up)
            ? '  UP  '
            : 'MODIFIED'
          : ' PEND ';
      console.log(` [${status}] ${m.id}`);
    }
    console.log('='.repeat(80));
    console.log(
      `Total: ${allMigrations.length}, Applied: ${applied.size}, Pending: ${allMigrations.length - applied.size}`
    );
    return;
  }

  // A half-done migration in the other direction must be finished first.
  const other = partialRows.find(r => r.direction !== command);
  if (other) {
    throw new Error(
      `${other.migration_id} is half-way through \`${other.direction}\`: rerun \`${other.direction}\` to finish it first`
    );
  }

  if (command === 'up') {
    const modified = allMigrations.filter(
      m => applied.has(m.id) && applied.get(m.id) !== getChecksum(m.up)
    );
    if (modified.length > 0) {
      throw new Error(
        `Applied migrations changed since they ran: ${modified.map(m => m.id).join(', ')}. ` +
          'Restore the applied files and put the change in a new migration'
      );
    }

    const pending = allMigrations.filter(m => !applied.has(m.id));
    if (pending.length === 0) {
      console.log('All migrations already applied.');
      return;
    }

    for (const m of pending) {
      const start = Date.now();
      console.log(`Applying: ${m.id}...`);
      await runSteps(connection, m.id, 'up', m.up);
      const duration = Date.now() - start;
      await finish(connection, m.id, 'up', getChecksum(m.up), duration);
      console.log(`  OK (${duration}ms)`);
    }
    console.log('All pending migrations applied.');
  }

  if (command === 'down') {
    const appliedSorted = allMigrations.filter(m => applied.has(m.id));
    if (appliedSorted.length === 0) {
      console.log('No migrations to roll back.');
      return;
    }

    const rawCount = restArgs[0];
    const count =
      rawCount === undefined || rawCount === '' || rawCount === 'all'
        ? rawCount === 'all'
          ? appliedSorted.length
          : 1
        : parseInt(rawCount, 10);
    const limit =
      Number.isInteger(count) && count > 0
        ? Math.min(count, appliedSorted.length)
        : 1;
    // Newest first: a down script may depend on what later migrations added.
    const toRollback = appliedSorted.slice(-limit).reverse();

    for (const m of toRollback) {
      if (!existsSync(m.down)) {
        throw new Error(`Down migration not found: ${m.down}`);
      }
      console.log(`Rolling back: ${m.id}...`);
      await runSteps(connection, m.id, 'down', m.down);
      await finish(connection, m.id, 'down');
      console.log('  OK');
    }
  }
}

async function run() {
  const connection = await mysql.createConnection(getDbConfig());
  try {
    if (command === 'status') {
      await migrate(connection);
      return;
    }
    const [[{ locked }]] = await connection.query('SELECT GET_LOCK(?, ?) AS locked', [
      LOCK_NAME,
      LOCK_TIMEOUT_SECONDS,
    ]);
    if (locked !== 1) {
      throw new Error(
        `Lock ${LOCK_NAME} not obtained within ${LOCK_TIMEOUT_SECONDS}s: another migration is running`
      );
    }
    try {
      await migrate(connection);
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    }
  } finally {
    await connection.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
