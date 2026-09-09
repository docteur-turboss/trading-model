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

const [, , command] = process.argv;

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

function getChecksum(filePath) {
  return createHash('sha256').update(readFileSync(filePath, 'utf8')).digest('hex');
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

async function run() {
  const dbConfig = getDbConfig();
  const connection = await mysql.createConnection({
    ...dbConfig,
    multipleStatements: true,
  });

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
        \`id\`          VARCHAR(255) NOT NULL PRIMARY KEY,
        \`name\`        VARCHAR(255) NOT NULL,
        \`applied_at\`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`checksum\`    VARCHAR(64) NOT NULL,
        \`duration_ms\` INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await connection.execute(
      `SELECT id, checksum FROM \`${MIGRATIONS_TABLE}\` ORDER BY id ASC`
    );
    const applied = new Map(rows.map(r => [r.id, r.checksum]));

    if (command === 'status') {
      console.log('\nMigration Status:');
      console.log('='.repeat(80));
      for (const m of allMigrations) {
        const checksum = applied.get(m.id);
        const status = checksum
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
      process.exit(0);
    }

    if (command === 'up') {
      const pending = allMigrations.filter(m => !applied.has(m.id));
      if (pending.length === 0) {
        console.log('All migrations already applied.');
        process.exit(0);
      }

      for (const m of pending) {
        const sql = readFileSync(m.up, 'utf8');
        const checksum = getChecksum(m.up);
        const start = Date.now();

        console.log(`Applying: ${m.id}...`);
        try {
          await connection.query(sql);
          const duration = Date.now() - start;
          await connection.execute(
            `INSERT INTO \`${MIGRATIONS_TABLE}\` (id, name, checksum, duration_ms) VALUES (?, ?, ?, ?)`,
            [m.id, m.id, checksum, duration]
          );
          console.log(`  OK (${duration}ms)`);
        } catch (err) {
          console.error(`  FAILED: ${err.message}`);
          process.exit(1);
        }
      }
      console.log('All pending migrations applied.');
    }

    if (command === 'down') {
      const lastApplied = allMigrations.filter(m => applied.has(m.id)).pop();
      if (!lastApplied) {
        console.log('No migrations to roll back.');
        process.exit(0);
      }

      if (!existsSync(lastApplied.down)) {
        console.error(`Down migration not found: ${lastApplied.down}`);
        process.exit(1);
      }

      const sql = readFileSync(lastApplied.down, 'utf8');
      console.log(`Rolling back: ${lastApplied.id}...`);
      try {
        await connection.query(sql);
        await connection.execute(`DELETE FROM \`${MIGRATIONS_TABLE}\` WHERE id = ?`, [
          lastApplied.id,
        ]);
        console.log('  OK');
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
        process.exit(1);
      }
    }
  } finally {
    await connection.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
