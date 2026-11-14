import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'scripts/compliance-check.mjs');
const CODE_DIRS = ['services', 'packages', 'deploy', 'scripts', 'observability', 'tests', '.github'];

function run(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'compliance-'));
  try {
    // Docs are copied (the tests mutate them); code is linked read-only (the script only reads it).
    cpSync(join(REPO, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
    cpSync(join(REPO, 'README.md'), join(dir, 'README.md'));
    cpSync(join(REPO, 'docs/compliance'), join(dir, 'docs/compliance'), { recursive: true });
    for (const d of CODE_DIRS) symlinkSync(join(REPO, d), join(dir, d), 'junction');
    mutate?.(dir);
    return spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });
  } finally {
    for (const d of CODE_DIRS) unlinkSync(join(dir, d)); // unlink only, never the real tree
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

test('fails on a code identifier that exists nowhere', () => {
  // Built at run time: scripts/ is searched code, a literal here would match itself.
  const ids = ['FAKE_ORDER_' + 'LIMIT', 'fakeCadence' + 'Xyz', 'no-such-' + 'file.ts'];
  const r = run((dir) => {
    const f = join(dir, 'docs/compliance/algorithmic-trading-compliance.md');
    writeFileSync(f, `${readFileSync(f, 'utf8')}\nLimit: ${ids.map((i) => `\`${i}\``).join(', ')}\n`);
  });
  assert.equal(r.status, 1);
  for (const id of ids) assert.ok(r.stderr.includes(id), id);
});

test('fails on database TLS claims, in the README too', () => {
  for (const [file, claim] of [
    ['README.md', 'mTLS ' + 'everywhere'],
    ['docs/compliance/access-control-policy.md', '| TLS ' + 'connection |'],
    ['docs/compliance/dpia.md', 'All inter-service ' + 'communication'],
  ]) {
    const r = run((dir) => {
      const f = join(dir, file);
      writeFileSync(f, `${readFileSync(f, 'utf8')}
${claim}
`);
    });
    assert.equal(r.status, 1, claim);
    assert.match(r.stderr, /stale wording/, claim);
  }
});
