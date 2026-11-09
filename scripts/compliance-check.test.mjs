import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'scripts/compliance-check.mjs');
const FILES = [
  'services/audit-logger/src/infrastructure/config/env.ts',
  'services/dlq-service/src/config/index-manager.ts',
  'observability/loki-config.yml',
  'docker-compose.yml',
  'deploy/k8s/infra/prometheus.yaml',
  'services/message-manager/src/application/ports/message-journal-port.ts',
  'scripts/retention-mysql.sh',
  'packages/http/src/infrastructure/sensitive-data-sanitizer.ts',
  'docs/compliance/data-processing-register.md',
  'docs/compliance/dpia.md',
  'docs/compliance/compliance-framework.md',
  'docs/compliance/information-security-policy.md',
];

function run(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'compliance-'));
  try {
    for (const f of FILES) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      cpSync(join(REPO, f), join(dir, f));
    }
    mutate?.(dir);
    return spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('passes on the real documents', () => {
  assert.equal(run().status, 0);
});

test('fails when the register cites a wrong journal duration', () => {
  const r = run((dir) => {
    const f = join(dir, 'docs/compliance/data-processing-register.md');
    writeFileSync(f, readFileSync(f, 'utf8').replace('journaled 24 h', 'journaled 48 h'));
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /journaled 24 h/);
});

test('fails on stale wording', () => {
  const r = run((dir) => {
    const f = join(dir, 'docs/compliance/dpia.md');
    writeFileSync(f, `${readFileSync(f, 'utf8')}\nPino redact\n`);
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /stale wording/);
});

test('fails when the security policy cites a wrong Loki or Prometheus duration', () => {
  for (const [from, to] of [['31 days (`744h`)', '30 days (`744h`)'], ['Prometheus → Grafana | 30 days', 'Prometheus → Grafana | 15 days']]) {
    const r = run((dir) => {
      const f = join(dir, 'docs/compliance/information-security-policy.md');
      writeFileSync(f, readFileSync(f, 'utf8').replace(from, to));
    });
    assert.equal(r.status, 1, from);
    assert.match(r.stderr, /information-security-policy/);
  }
});
