import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Runs the real scripts/release.mjs, copied into a throwaway git repository (it releases its parent directory).
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'release.mjs');
const GIT_ID = ['-c', 'user.name=release-test', '-c', 'user.email=release-test@example.invalid'];
const GIT_NO_SIGN = ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'];
let repo;

function git(...args) {
  return execFileSync('git', [...GIT_ID, ...GIT_NO_SIGN, ...args], { cwd: repo, encoding: 'utf-8' });
}

function writeJson(path, value) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), `${JSON.stringify(value, null, 2)}\n`);
}

function commit(message) {
  writeFileSync(join(repo, 'change.txt'), `${message}\n`);
  git('add', '-A');
  git('commit', '--no-verify', '-q', '-m', message);
}

function release(...args) {
  const r = spawnSync(process.execPath, [join(repo, 'scripts', 'release.mjs'), ...args], { cwd: repo, encoding: 'utf-8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function version(path) {
  return JSON.parse(readFileSync(join(repo, path, 'package.json'), 'utf-8')).version;
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'release-'));
  git('init', '-q');
  mkdirSync(join(repo, 'scripts'));
  copyFileSync(SCRIPT, join(repo, 'scripts', 'release.mjs'));
  writeJson('package.json', { name: 'root', version: '3.0.0' });
  writeJson('services/svc/package.json', { name: 'svc', version: '3.0.0' });
  writeJson('packages/common/package.json', { name: '@trading-model/common', version: '1.0.0' });
  commit(':tada:(common): initial');
  git('tag', '-a', 'v3.0.0', '-m', 'v3.0.0');
  commit(':sparkles:(common): add a feature');
});

after(() => rmSync(repo, { recursive: true, force: true }));

test('first prerelease bumps from the last stable tag: v3.0.0 + feature = 3.1.0-rc.1', () => {
  const { status, out } = release('--dry-run', '--prerelease', 'rc');
  assert.equal(status, 0, out);
  assert.match(out, /Since tag: v3\.0\.0/);
  assert.match(out, /Release 3\.1\.0-rc\.1 /);
  assert.match(out, /## \[3\.1\.0-rc\.1\]/);
  assert.match(out, /@trading-model\/common\s+1\.0\.0 → 1\.1\.0 \(minor\)/);
});

test('second prerelease: rc.2 after tag v3.1.0-rc.1, same base, no double bump of the libs', () => {
  const { status, out } = release('--prerelease', 'rc');
  assert.equal(status, 0, out);
  assert.equal(version('.'), '3.1.0-rc.1');
  assert.equal(version('services/svc'), '3.1.0-rc.1');
  assert.equal(version('packages/common'), '1.1.0');
  assert.match(readFileSync(join(repo, 'CHANGELOG.md'), 'utf-8'), /^## \[3\.1\.0-rc\.1\]/);
  commit(':rocket:(release): v3.1.0-rc.1');
  git('tag', '-a', 'v3.1.0-rc.1', '-m', 'v3.1.0-rc.1');
  commit(':bug:(common): fix the feature');

  const next = release('--dry-run', '--prerelease', 'rc');
  assert.equal(next.status, 0, next.out);
  assert.match(next.out, /Since tag: v3\.0\.0/);
  assert.match(next.out, /Release 3\.1\.0-rc\.2 /);
  assert.match(next.out, /@trading-model\/common\s+1\.0\.0 → 1\.1\.0 \(minor\)/);
  assert.doesNotMatch(next.out, /v3\.1\.0-rc\.1$/m, 'the rc.1 release commit is not a change');
});

test('stable release after a prerelease: base = last stable tag, 3.1.0, no NaN', () => {
  const { status, out } = release('--dry-run');
  assert.equal(status, 0, out);
  assert.match(out, /Since tag: v3\.0\.0/);
  assert.match(out, /Release 3\.1\.0 /);
  assert.match(out, /Root: 3\.1\.0-rc\.1 → 3\.1\.0 \(minor\)/);
  assert.match(out, /@trading-model\/common\s+1\.0\.0 → 1\.1\.0 \(minor\)/);
  assert.doesNotMatch(out, /NaN/);
});

test('prerelease number is numeric: rc.10 follows rc.9', () => {
  git('tag', 'v3.1.0-rc.9');
  const { status, out } = release('--dry-run', '--prerelease', 'rc');
  assert.equal(status, 0, out);
  assert.match(out, /Release 3\.1\.0-rc\.10 /);
});

test('refuses a missing or invalid prerelease id, --prerelease with --version, and unknown options', () => {
  for (const args of [['--prerelease'], ['--prerelease', 'rc.1'], ['--prerelease', 'rc', '--version', '3.1.0'], ['--pre-release', 'rc']]) {
    const { status, out } = release('--dry-run', ...args);
    assert.equal(status, 1, `${args.join(' ')}: ${out}`);
  }
});

test('an option is never taken as the value of the option before it (a dry run stays a dry run)', () => {
  for (const args of [['--prerelease', '--dry-run'], ['--prerelease', '--publish'], ['--version', '--dry-run'], ['--bump', '--dry-run']]) {
    const { status, out } = release(...args);
    assert.equal(status, 1, `${args.join(' ')}: ${out}`);
    assert.equal(git('status', '--porcelain'), '', `${args.join(' ')} wrote files`);
  }
});

test('--publish exits 1 with the failing command when the push fails (no remote), never prints "published"', () => {
  git('checkout', '-q', '-B', 'main');
  git('branch', '-f', 'development', 'main');
  const { status, out } = release('--publish', '--prerelease', 'beta');
  assert.equal(status, 1, out);
  assert.match(out, /Command failed: git push/);
  assert.doesNotMatch(out, /published/);
});
