import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkEnvironment } from './check-environment-protection.mjs';

const rule = (o = {}) => ({ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User' }], ...o });
const env = (rules, custom = true) => ({ protection_rules: rules, deployment_branch_policy: custom ? { protected_branches: false, custom_branch_policies: true } : null });
const tag = [{ type: 'tag', name: 'v*' }];

test('absent environment', () => assert.match(checkEnvironment(null, [])[0], /does not exist/));
test('no reviewer rule', () => assert.deepEqual(checkEnvironment(env([]), tag), ['no required reviewer']));
test('empty reviewers', () => assert.deepEqual(checkEnvironment(env([rule({ reviewers: [] })]), tag), ['no required reviewer']));
test('self-review allowed', () => assert.match(checkEnvironment(env([rule({ prevent_self_review: false })]), tag)[0], /self-review/));
test('no branch limit', () => assert.match(checkEnvironment(env([rule()], false), tag)[0], /not limited/));
test('no v* tag rule', () => assert.deepEqual(checkEnvironment(env([rule()]), [{ type: 'branch', name: 'v*' }]), ['no deployment tag rule "v*"']));
test('compliant', () => assert.deepEqual(checkEnvironment(env([rule()]), tag), []));

// CLI: fake `gh` (node script) first in PATH answers from FAKE_ROUTES {path: {status, body}}.
const dir = mkdtempSync(join(tmpdir(), 'fakegh-'));
writeFileSync(join(dir, 'gh.js'), `const r = JSON.parse(process.env.FAKE_ROUTES)[process.argv[3]];
if (!r) { console.error('HTTP 404'); process.exit(1); }
if (r.status !== 200) { console.error('HTTP ' + r.status); process.exit(1); }
console.log(JSON.stringify(r.body));`);
writeFileSync(join(dir, 'gh.cmd'), '@node "%~dp0gh.js" %*\r\n');
writeFileSync(join(dir, 'gh'), '#!/bin/sh\nexec node "$(dirname "$0")/gh.js" "$@"\n');
chmodSync(join(dir, 'gh'), 0o755);
const script = fileURLToPath(new URL('./check-environment-protection.mjs', import.meta.url));
const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH'); // `Path` on Windows
const run = (name, routes, extra = {}) => {
  const r = spawnSync(process.execPath, [script, name, 'o/r'], {
    encoding: 'utf8',
    env: { ...process.env, [pathKey]: dir + delimiter + process.env[pathKey], FAKE_ROUTES: JSON.stringify(routes), ...extra },
  });
  return { code: r.status, out: r.stdout + r.stderr };
};
const base = 'repos/o/r/environments/';
const ok = { [base + 'production']: { status: 200, body: env([rule()]) }, [base + 'production/deployment-branch-policies?per_page=100']: { status: 200, body: { branch_policies: tag } } };

test('cli: 404 -> ::error:: + DEPLOY.md, exit 1 in production', { skip: process.platform === 'win32' && 'execFileSync(\"gh\") only resolves gh.exe on Windows' }, () => {
  const r = run('production', {});
  assert.equal(r.code, 1);
  assert.match(r.out, /::error::.*does not exist.*DEPLOY\.md/);
});
test('cli: 404 on staging -> ::warning::, exit 0', { skip: process.platform === 'win32' && 'execFileSync(\"gh\") only resolves gh.exe on Windows' }, () => {
  const r = run('staging', {});
  assert.equal(r.code, 0);
  assert.match(r.out, /::warning::.*DEPLOY\.md/);
});
test('cli: 403 fails closed, never compliant', { skip: process.platform === 'win32' && 'execFileSync(\"gh\") only resolves gh.exe on Windows' }, () => {
  const r = run('production', { [base + 'production']: { status: 403 } });
  assert.notEqual(r.code, 0);
  assert.doesNotMatch(r.out, /::warning::/);
});
test('cli: compliant -> exit 0, no output', { skip: process.platform === 'win32' && 'execFileSync(\"gh\") only resolves gh.exe on Windows' }, () => {
  const r = run('production', ok);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), '');
});
test('cli: exists output for the deploy preflight', { skip: process.platform === 'win32' && 'execFileSync(\"gh\") only resolves gh.exe on Windows' }, () => {
  const out = join(dir, 'github-output');
  writeFileSync(out, '');
  run('production', {}, { GITHUB_OUTPUT: out });
  assert.equal(readFileSync(out, 'utf8').trim(), 'exists=false');
  writeFileSync(out, '');
  run('production', ok, { GITHUB_OUTPUT: out });
  assert.equal(readFileSync(out, 'utf8').trim(), 'exists=true');
});
