/**
 * Reads a service's pinned image from docker-compose.yml, so database specs
 * run against exactly the images the stack deploys.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

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

module.exports = { composeImage };
