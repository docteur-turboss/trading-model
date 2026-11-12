import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { wideBindings } from './compose-ports-check.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'compose-ports-check.mjs');
const svc = (body) => `services:\n  a:\n    image: x\n${body}`;

test('short form: public bind fails, loopback with variable passes', () => {
  assert.equal(wideBindings(svc('    ports:\n      - "9090:9090"\n')).length, 1);
  assert.equal(wideBindings(svc('    ports:\n      - 3000\n')).length, 1);
  assert.equal(wideBindings(svc("    ports:\n      - '127.0.0.1:${X:-9090}:9090'\n")).length, 0);
});

test('expose and ports: !reset [] are ignored', () => {
  assert.equal(wideBindings(svc('    expose:\n      - "9090"\n    ports: !reset []\n')).length, 0);
});

test('long form needs host_ip 127.0.0.1', () => {
  const bad = svc('    ports:\n      - target: 3000\n        published: 8443\n');
  const wide = svc('    ports:\n      - target: 3000\n        host_ip: 0.0.0.0\n');
  const ok = svc('    ports:\n      - target: 3000\n        published: 8443\n        host_ip: 127.0.0.1\n');
  assert.equal(wideBindings(bad).length, 1);
  assert.equal(wideBindings(wide).length, 1);
  assert.equal(wideBindings(ok).length, 0);
});

test('inline ports: [..] is checked, other inline values fail closed', () => {
  assert.equal(wideBindings(svc('    ports: ["9090:9090"]\n')).length, 1);
  assert.equal(wideBindings(svc('    ports: ["127.0.0.1:1:2", "0.0.0.0:3:4"]\n')).length, 1);
  assert.equal(wideBindings(svc('    ports: ["127.0.0.1:1:2"] # ok\n')).length, 0);
  assert.equal(wideBindings(svc('    ports: *anchor\n')).length, 1);
});

test('CRLF and following keys', () => {
  const t = svc('    ports:\n      - "127.0.0.1:1:2"\n    volumes:\n      - "9:9"\n').replace(/\n/g, '\r\n');
  assert.equal(wideBindings(t).length, 0);
});

test('CLI exits 1 on a bad compose file, 0 on the repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ports-'));
  try {
    writeFileSync(join(dir, 'docker-compose.yml'), svc('    ports:\n      - "9090:9090"\n'));
    assert.equal(spawnSync('node', [SCRIPT, dir]).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(spawnSync('node', [SCRIPT]).status, 0);
});
