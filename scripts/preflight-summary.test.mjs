import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./preflight-summary.sh', import.meta.url));
const run = (checks, args = ['production', 'v3.1.0']) => {
  const env = { ...process.env, CHECKS: checks };
  delete env.GITHUB_STEP_SUMMARY;
  const r = spawnSync('bash', [script, ...args], { encoding: 'utf8', env });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('every failure is listed, not only the first', () => {
  const r = run('A=success\nB=failure\nC=failure\nD=warning');
  assert.equal(r.code, 1);
  assert.match(r.out, /::error::.*2 guard\(s\).*: B, C\./);
  assert.match(r.out, /\| D \| warning/);
});
test('skipped rows are left out', () => {
  const r = run('Kubeconfigs (production)=skipped\n  Kubeconfigs (staging)=success\n');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Kubeconfigs \(production\)/);
  assert.match(r.out, /\| Kubeconfigs \(staging\) \| pass \|/);
});
test('cancelled or empty outcome is no pass', () => {
  const r = run('A=cancelled\nB=');
  assert.equal(r.code, 1);
  assert.match(r.out, /: A, B\./);
});
test('a guard name may hold "="', () => assert.match(run('x=y=failure').out, /: x=y\./));
test('all pass exits 0', () => assert.equal(run('Image digests=success\nIngress hosts=warning').code, 0));
test('no result at all exits 2', () => assert.equal(run('').code, 2));
test('missing arguments exit 64', () => assert.equal(run('A=success', []).code, 64));
