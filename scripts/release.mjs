import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const GITMOJI_MAP = {
  ':sparkles:': 'feat',
  '✨': 'feat',
  ':label:': 'feat',
  '🏷️': 'feat',
  ':tada:': 'feat',
  '🎉': 'feat',
  ':bug:': 'fix',
  '🐛': 'fix',
  ':ambulance:': 'fix',
  '🚑': 'fix',
  ':pencil2:': 'fix',
  '✏️': 'fix',
  ':fire:': 'fix',
  '🔥': 'fix',
  ':memo:': 'docs',
  '📝': 'docs',
  ':books:': 'docs',
  '📚': 'docs',
  ':lipstick:': 'style',
  '💄': 'style',
  ':shirt:': 'style',
  '👕': 'style',
  ':recycle:': 'refactor',
  '♻️': 'refactor',
  ':art:': 'refactor',
  '🎨': 'refactor',
  ':wastebasket:': 'refactor',
  '🗑️': 'refactor',
  ':zap:': 'perf',
  '⚡': 'perf',
  ':rocket:': 'perf',
  '🚀': 'perf',
  ':white_check_mark:': 'test',
  '✅': 'test',
  ':test_tube:': 'test',
  '🧪': 'test',
  ':boom:': 'breaking',
  '💥': 'breaking',
  ':wrench:': 'chore',
  '🔧': 'chore',
  ':pushpin:': 'chore',
  '📌': 'chore',
  ':arrow_up:': 'chore',
  '⬆️': 'chore',
  ':arrow_down:': 'chore',
  '⬇️': 'chore',
  ':construction_worker:': 'ci',
  '👷': 'ci',
  ':green_heart:': 'ci',
  '💚': 'ci',
  ':lock:': 'security',
  '🔒': 'security',
  ':shield:': 'security',
  '🛡️': 'security',
};

const SCOPE_TO_PACKAGE = {
  common: 'packages/common',
  http: 'packages/http',
  crypto: 'packages/crypto',
  'address-manager': 'packages/address-manager',
  broker: 'packages/broker-message',
  'api-gateway': 'services/api-gateway',
  'audit-logger': 'services/audit-logger',
  'decision-consumer': 'services/decision-consumer',
  'model-evaluator': 'services/model-evaluator',
  'financial-scraper': 'services/financial-scraper',
  scraper: 'services/financial-scraper',
  'trader-trainer': 'services/trader-trainer',
  trainer: 'services/trader-trainer',
};

function run(cmd) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Like run(), but a failing command prints itself and its stderr, then exits 1 (ADR-0017: no swallowed error). */
function runOrDie(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    console.error(`\n  ✗ Command failed: ${cmd}\n${String(err.stderr || err.message).trim()}`);
    process.exit(1);
  }
}

function parseCommits(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const match = line.match(
        /^([a-f0-9]+)\s+(:[\w-]+:|\p{Emoji})(?:\(([\w$.\-*/ ]+)\))?!?:?\s(.+)$/u
      );
      if (!match) return null;
      const [, hash, emoji, scope, subject] = match;
      return {
        hash: hash.slice(0, 7),
        emoji,
        type: GITMOJI_MAP[emoji] || 'other',
        scope: scope || null,
        subject,
        breaking: line.includes('!:') || line.includes(':boom:') || line.includes('💥'),
      };
    })
    .filter(Boolean);
}

/**
 * Version the bump starts from. A prerelease root (`3.1.0-rc.1`) starts from the last
 * stable tag, so rc.1, rc.2 and the stable release all compute the same `X.Y.Z`.
 */
function baseVersion(pkgVersion, stableTag) {
  if (!pkgVersion.includes('-')) return pkgVersion;
  return stableTag ? stableTag.replace(/^v/, '') : pkgVersion.split('-')[0];
}

/** `<target>-<id>.N`, N = 1 + the highest existing tag `v<target>-<id>.N`. */
function prereleaseVersion(target, id) {
  const prefix = `v${target}-${id}.`;
  run('git fetch --tags --quiet'); // stale local tags would reuse an N already pushed (no-op without a remote)
  const taken = run('git tag --list')
    .split('\n')
    .filter(t => t.startsWith(prefix))
    .map(t => Number(t.slice(prefix.length)))
    .filter(Number.isInteger);
  return `${target}-${id}.${Math.max(0, ...taken) + 1}`;
}

/** Newest stable tag `vX.Y.Z` reachable from HEAD (prerelease tags ignored), '' if none. */
function lastStableTag() {
  return run('git describe --tags --abbrev=0 --exclude "*-*"');
}

/** Version of `<pkgPath>/package.json` at `ref`, null if the file did not exist there. */
function versionAt(ref, pkgPath) {
  const raw = run(`git show ${ref}:${pkgPath}/package.json`);
  return raw ? JSON.parse(raw).version : null;
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function getBumpType(commits) {
  const types = new Set(
    commits.map(c => {
      if (c.breaking) return 'major';
      if (c.type === 'feat') return 'minor';
      return 'patch';
    })
  );
  if (types.has('major')) return 'major';
  if (types.has('minor')) return 'minor';
  return 'patch';
}

function updatePackageJson(pkgPath, newVersion) {
  const filePath = join(ROOT, pkgPath, 'package.json');
  const pkg = JSON.parse(readFileSync(filePath, 'utf-8'));
  const oldVersion = pkg.version;
  pkg.version = newVersion;
  writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
  return oldVersion;
}

function formatChangelogLine(c) {
  const scope = c.scope ? `**${c.scope}:** ` : '';
  return `- ${c.hash} ${scope}${c.subject}`;
}

const TYPE_ORDER = [
  'breaking', 'feat', 'fix', 'perf', 'refactor', 'style',
  'docs', 'test', 'chore', 'ci', 'security', 'other',
];

function parseArgs() {
  const args = { dryRun: false, bump: null, version: null, publish: false, prepare: false, prerelease: null };
  const argv = process.argv.slice(2);
  const BOOLEAN_FLAGS = { '--dry-run': 'dryRun', '--publish': 'publish', '--prepare': 'prepare' };
  const VALUE_FLAGS = { '--bump': 'bump', '--version': 'version', '--prerelease': 'prerelease' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag in VALUE_FLAGS) {
      const value = argv[++i];
      // `--prerelease --dry-run` must not take "--dry-run" as the id and publish for real.
      if (!value || value.startsWith('-')) {
        console.error(`  Missing value for ${flag}.`);
        process.exit(1);
      }
      args[VALUE_FLAGS[flag]] = value;
    } else if (flag in BOOLEAN_FLAGS) {
      args[BOOLEAN_FLAGS[flag]] = true;
    } else {
      // An ignored flag would release something else than asked (a stable release for a mistyped --prerelease).
      console.error(`  Unknown option: "${flag}".`);
      process.exit(1);
    }
  }
  if (argv.includes('--prerelease') && !/^[0-9A-Za-z-]+$/.test(args.prerelease || '')) {
    console.error(`  Invalid prerelease id: "${args.prerelease}". Use letters, digits or "-" (e.g. rc).`);
    process.exit(1);
  }
  if (args.prerelease && args.version) {
    console.error('  --prerelease cannot be combined with --version.');
    process.exit(1);
  }
  if (args.publish && args.version) {
    console.error('  --publish cannot be combined with --version (it would merge and publish nothing).');
    process.exit(1);
  }
  if (args.prepare && (args.publish || args.version || args.dryRun)) {
    console.error('  --prepare cannot be combined with --publish, --version or --dry-run.');
    process.exit(1);
  }
  if (args.bump && !['major', 'minor', 'patch'].includes(args.bump)) {
    console.error(`  Invalid bump type: "${args.bump}". Use major, minor, or patch.`);
    process.exit(1);
  }
  if (args.version && !/^\d+\.\d+\.\d+$/.test(args.version)) {
    console.error(`  Invalid version: "${args.version}". Use semver format (e.g. 1.4.0).`);
    process.exit(1);
  }
  return args;
}

function handlePublishMerge(args) {
  if (!(args.publish || args.prepare) || args.dryRun) return;
  const flag = args.prepare ? '--prepare' : '--publish';
  const branch = run('git rev-parse --abbrev-ref HEAD');
  if (args.prepare ? !branch.startsWith('release/') : branch !== 'main') {
    console.error(`  ${flag} requires being on ${args.prepare ? 'a release/* branch' : 'main branch'} (currently on ${branch}).\n`);
    process.exit(1);
  }
  // publishRelease runs `git add -A`: a dirty tree would end up in the release commit.
  if (runOrDie('git status --porcelain')) {
    console.error(`  ${flag} requires a clean working tree (commit or remove your changes).\n`);
    process.exit(1);
  }
  if (args.prepare) return mergeMainIntoRelease();
  console.log('\n  → Merging development into main...');
  const mergeOut = run('git merge development --no-edit');
  if (mergeOut === '' && run('git diff --name-only --diff-filter=U')) {
    console.error('  ✖ Merge conflicts detected. Resolve them and retry.\n');
    process.exit(1);
  }
  console.log('  ✓ Merged development into main\n');
}

/**
 * --prepare: merges main into the release/* branch (made from development). The last tag, on main's merge
 * commit, becomes reachable and CHANGELOG.md / package.json start from main's, so the PR to main has no
 * conflict. Conflicts on those files are settled here (development's content and deletions, main's version
 * and CHANGELOG); any other conflict stops the release.
 */
function mergeMainIntoRelease() {
  run('git fetch origin main --quiet'); // no-op without a remote
  const ref = run('git rev-parse --verify --quiet origin/main') ? 'origin/main' : 'main';
  console.log(`\n  → Merging ${ref} into the release branch...`);
  run(`git merge ${ref} --no-ff --no-verify -m ":twisted_rightwards_arrows:(release): fusionner main"`);
  for (const file of run('git diff --name-only --diff-filter=U').split('\n').filter(Boolean)) {
    if (file === 'CHANGELOG.md') {
      runOrDie(`git checkout --theirs -- "${file}"`);
    } else if (!file.endsWith('package.json')) {
      run('git merge --abort');
      console.error(`  ✖ Merge conflict on ${file}: resolve it on development, then retry.\n`);
      process.exit(1);
    } else {
      const ours = run(`git show ":2:${file}"`);
      const theirs = run(`git show ":3:${file}"`);
      if (!ours) {
        runOrDie(`git rm -q -- "${file}"`); // workspace deleted on development
        continue;
      }
      const pkg = JSON.parse(ours);
      if (theirs) pkg.version = JSON.parse(theirs).version;
      writeFileSync(join(ROOT, file), `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
    }
    runOrDie(`git add -- "${file}"`);
  }
  if (run('git rev-parse -q --verify MERGE_HEAD')) runOrDie('git commit --no-verify --no-edit');
  runOrDie(`git merge-base --is-ancestor ${ref} HEAD`);
  console.log(`  ✓ Merged ${ref}\n`);
}

function collectCommits(args, lastTag) {
  let rawCommits;
  if (args.version) {
    console.log(`\n  Explicit version: ${args.version} (skipping commit auto-detection)\n`);
  } else if (lastTag) {
    rawCommits = run(`git log ${lastTag}..HEAD --format="%H %s" --no-merges`);
    console.log(`\n  Since tag: ${lastTag}`);
  } else {
    rawCommits = run('git log --format="%H %s" --no-merges');
    console.log('\n  No tags found — using full history');
  }
  // The release commits of earlier prereleases (`:rocket:(release): vX.Y.Z-rc.N`) are not changes.
  return parseCommits(rawCommits).filter(c => !(c.scope === 'release' && /^v\d/.test(c.subject)));
}

function groupByScope(commits) {
  const scoped = {};
  const unscoped = [];
  for (const c of commits) {
    if (c.scope) {
      if (!scoped[c.scope]) scoped[c.scope] = [];
      scoped[c.scope].push(c);
    } else {
      unscoped.push(c);
    }
  }
  return { scoped, unscoped };
}

function handleExplicitVersion(args) {
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  console.log(`  Root: ${rootPkg.version} → ${args.version}\n`);
  bumpRoot(rootPkg, args.version, args.dryRun);
  console.log(`\n  ── Release ${args.version} ──\n`);
  if (args.dryRun) console.log("  ⚠️  Dry run — no files written\n");
  else console.log("  ✓ package.json updated");
  console.log();
}

function resolveVersion(args, allCommits, stableTag) {
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  const oldRootVer = rootPkg.version;
  const rootBump = args.bump || getBumpType(allCommits);
  const target = bumpVersion(baseVersion(oldRootVer, stableTag), rootBump);
  const newVersion = args.prerelease ? prereleaseVersion(target, args.prerelease) : target;
  return { rootPkg, oldRootVer, rootBump, newVersion };
}

/**
 * Bumps each touched package from its version at the last stable tag, not its current one:
 * rc.1, rc.2 and the stable release give the same version (no double bump). A package
 * absent from that tag keeps its declared version.
 */
function bumpPackages(scoped, args, dryRun, stableTag) {
  const bumps = [];
  for (const [scope, commits] of Object.entries(scoped)) {
    const pkgPath = SCOPE_TO_PACKAGE[scope];
    // Services follow the platform version (alignServices), never their own bump.
    if (!pkgPath || pkgPath.startsWith('services/')) continue;
    const type = args.bump || getBumpType(commits);
    const pkg = JSON.parse(readFileSync(join(ROOT, pkgPath, 'package.json'), 'utf-8'));
    const released = stableTag ? versionAt(stableTag, pkgPath) : pkg.version;
    const oldVersion = released ?? pkg.version;
    const newVersion = released ? bumpVersion(released, type) : pkg.version;
    if (!dryRun) updatePackageJson(pkgPath, newVersion);
    bumps.push({ scope, pkg: pkg.name, path: pkgPath, oldVersion, newVersion, type });
  }
  return bumps;
}

/** Sets every services/<dir>/package.json to the release version: the root version is the tag and the image tag. */
function alignServices(newVersion) {
  for (const dir of readdirSync(join(ROOT, 'services'))) {
    if (existsSync(join(ROOT, 'services', dir, 'package.json'))) {
      updatePackageJson(`services/${dir}`, newVersion);
    }
  }
}

function bumpRoot(rootPkg, newVersion, dryRun) {
  if (dryRun) return;
  alignServices(newVersion);
  rootPkg.version = newVersion;
  writeFileSync(join(ROOT, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`, 'utf-8');
}

function writeChangelogSection(entries, header) {
  if (entries.length === 0) return '';
  let section = `### ${header}\n\n`;
  for (const t of TYPE_ORDER) {
    const filtered = entries.filter(c => c.type === t);
    if (filtered.length === 0) continue;
    const label = t === 'breaking' ? '💥 Breaking' : `${t.charAt(0).toUpperCase() + t.slice(1)}`;
    section += `#### ${label}\n\n`;
    for (const c of filtered) section += `${formatChangelogLine(c)}\n`;
    section += '\n';
  }
  return section;
}

function buildChangelog(bumps, scoped, unscoped, newVersion, dryRun) {
  const date = new Date().toISOString().slice(0, 10);
  let changelog = `## [${newVersion}] - ${date}\n\n`;
  for (const b of bumps) {
    changelog += writeChangelogSection(scoped[b.scope], `${b.pkg} (${b.oldVersion} → ${b.newVersion})`);
  }
  // Scopes with no package (k8s, ci, docs...) bump nothing but still belong in the changelog.
  const root = [...unscoped, ...Object.entries(scoped).filter(([s]) => !SCOPE_TO_PACKAGE[s]).flatMap(([, c]) => c)];
  if (root.length > 0) {
    changelog += writeChangelogSection(root, 'Root');
  }
  if (!dryRun) {
    const changelogPath = join(ROOT, 'CHANGELOG.md');
    let existing = '';
    if (existsSync(changelogPath)) {
      existing = readFileSync(changelogPath, 'utf-8');
    }
    writeFileSync(changelogPath, changelog + (existing ? `\n${existing}` : ''), 'utf-8');
  }
  return changelog;
}

function printSummary(bumps, oldRootVer, newVersion, rootBump, dryRun) {
  console.log(`\n  ── Release ${newVersion} ──\n`);
  if (dryRun) console.log("  ⚠️  Dry run — no files written\n");
  else console.log("  ✓ CHANGELOG.md updated\n");
  if (bumps.length > 0) {
    console.log('  Package bumps:');
    for (const b of bumps) {
      console.log(`    ${b.pkg.padEnd(35)} ${b.oldVersion} → ${b.newVersion} (${b.type})`);
    }
    console.log();
  }
  console.log(`  Root: ${oldRootVer} → ${newVersion} (${rootBump})\n`);
}

function publishRelease(newVersion, args) {
  if (!(args.publish || args.prepare) || args.dryRun) return;
  console.log(`\n  ── ${args.prepare ? 'Preparing' : 'Publishing'} release ──\n`);
  console.log('  → Staging files...');
  runOrDie('git add -A');
  const commitMsg = `:rocket:(release): v${newVersion}`;
  console.log(`  → Committing: ${commitMsg}`);
  runOrDie(`git commit --no-verify -m "${commitMsg}"`);
  if (args.prepare) {
    console.log(`version=v${newVersion}`); // last line, read by the orchestrator
    return;
  }
  console.log(`  → Tagging v${newVersion}...`);
  runOrDie(`git tag -a v${newVersion} -m "${commitMsg}"`);
  console.log('  → Pushing commits and tags...');
  runOrDie('git push --follow-tags');
  if (!runOrDie(`git ls-remote --tags origin v${newVersion}`)) {
    console.error(`\n  ✗ Tag v${newVersion} is not on origin after the push.`);
    process.exit(1);
  }
  console.log(`  ✓ Release v${newVersion} published.\n`);
}

function main() {
  const args = parseArgs();
  if (args.dryRun) console.log('\n  ⚠️  DRY RUN — no files will be modified\n');

  handlePublishMerge(args);

  const stableTag = lastStableTag();
  const allCommits = collectCommits(args, stableTag);
  if (!args.version && allCommits.length === 0) {
    console.log('  No new commits to release.\n');
    return;
  }

  if (args.version) {
    handleExplicitVersion(args);
    return;
  }

  const { scoped, unscoped } = groupByScope(allCommits);
  const { rootPkg, oldRootVer, rootBump, newVersion } = resolveVersion(args, allCommits, stableTag);
  const bumps = bumpPackages(scoped, args, args.dryRun, stableTag);
  bumpRoot(rootPkg, newVersion, args.dryRun);
  const changelog = buildChangelog(bumps, scoped, unscoped, newVersion, args.dryRun);
  if (args.dryRun) console.log(changelog);
  printSummary(bumps, oldRootVer, newVersion, rootBump, args.dryRun);
  publishRelease(newVersion, args);
}

main();
