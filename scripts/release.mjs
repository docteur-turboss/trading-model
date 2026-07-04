import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
  'address-manager': 'packages/address-manager',
  broker: 'packages/broker-message',
  'message-manager': 'services/message-manager',
  discovery: 'services/discovery-server',
  'discovery-server': 'services/discovery-server',
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

function parseCommits(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const match = line.match(
        /^([a-f0-9]+)\s+(:[\w-]+:|\p{Emoji})(?:\(([\w$.\-*/ ]+)\))?!?:\s(.+)$/u
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

function parseArgs() {
  const args = { dryRun: false, bump: null, version: null, publish: false };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--bump') args.bump = process.argv[++i] || null;
    else if (arg === '--version') args.version = process.argv[++i] || null;
    else if (arg === '--publish') args.publish = true;
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

function main() {
  const args = parseArgs();
  if (args.dryRun) console.log('\n  ⚠️  DRY RUN — no files will be modified\n');

  // ── When --publish: merge development first, then collect commits ──
  if (args.publish && !args.dryRun) {
    const branch = run('git rev-parse --abbrev-ref HEAD');
    if (branch !== 'main') {
      console.error(`  --publish requires being on main branch (currently on ${branch}).\n`);
      process.exit(1);
    }
    console.log('\n  → Merging development into main...');
    const mergeOut = run('git merge development --no-edit');
    if (mergeOut === '' && run('git diff --name-only --diff-filter=U')) {
      console.error('  ✖ Merge conflicts detected. Resolve them and retry.\n');
      process.exit(1);
    }
    console.log('  ✓ Merged development into main\n');
  }

  // ── Collect commits ──
  const lastTag = run('git describe --tags --abbrev=0');
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  let rawCommits;

  if (args.version) {
    console.log(`\n  Explicit version: ${args.version} (skipping commit auto-detection)\n`);
  } else if (lastTag) {
    rawCommits = run(`git log ${range} --format="%H %s" --no-merges`);
    console.log(`\n  Since tag: ${lastTag}`);
  } else {
    rawCommits = run('git log --format="%H %s" --no-merges');
    console.log('\n  No tags found — using full history');
  }

  const allCommits = rawCommits ? parseCommits(rawCommits) : [];
  if (!args.version && allCommits.length === 0) {
    console.log('  No new commits to release.\n');
    return;
  }

  // Group commits by scope
  const scoped = {};
  const unscoped = [];
  for (const c of allCommits) {
    if (c.scope) {
      if (!scoped[c.scope]) scoped[c.scope] = [];
      scoped[c.scope].push(c);
    } else {
      unscoped.push(c);
    }
  }

  // ── Determine bump type ──
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  const oldRootVer = rootPkg.version;

  if (args.version) {
    // Skip per-package version bumps when using --version
    console.log(`  Root: ${oldRootVer} → ${args.version}\n`);
    if (!args.dryRun) {
      rootPkg.version = args.version;
      writeFileSync(join(ROOT, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`, 'utf-8');
    }
    // Output summary
    console.log(`\n  ── Release ${args.version} ──\n`);
    if (args.dryRun) console.log(`  ⚠️  Dry run — no files written\n`);
    else console.log(`  ✓ package.json updated`);
    console.log();
    return;
  }

  const rootBump = args.bump || getBumpType(allCommits);
  const newRootVer = bumpVersion(oldRootVer, rootBump);

  // Bump versions per package
  const bumps = [];
  for (const [scope, commits] of Object.entries(scoped)) {
    const pkgPath = SCOPE_TO_PACKAGE[scope];
    if (!pkgPath) continue;
    const type = args.bump || getBumpType(commits);
    const filePath = join(ROOT, pkgPath, 'package.json');
    const pkg = JSON.parse(readFileSync(filePath, 'utf-8'));
    const newVersion = bumpVersion(pkg.version, type);
    const oldVersion = args.dryRun ? pkg.version : updatePackageJson(pkgPath, newVersion);
    bumps.push({ scope, pkg: pkg.name, path: pkgPath, oldVersion, newVersion, type });
  }

  // Root version bump
  if (!args.dryRun) {
    rootPkg.version = newRootVer;
    writeFileSync(join(ROOT, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`, 'utf-8');
  }

  // Build CHANGELOG
  const date = new Date().toISOString().slice(0, 10);
  const newVersion = newRootVer;
  let changelog = `## [${newVersion}] - ${date}\n\n`;

  for (const b of bumps) {
    changelog += `### ${b.pkg} (${b.oldVersion} → ${b.newVersion})\n\n`;
    const typeOrder = [
      'breaking',
      'feat',
      'fix',
      'perf',
      'refactor',
      'style',
      'docs',
      'test',
      'chore',
      'ci',
      'security',
      'other',
    ];
    for (const t of typeOrder) {
      const filtered = scoped[b.scope].filter(c => c.type === t);
      if (filtered.length === 0) continue;
      const label = t === 'breaking' ? '💥 Breaking' : `${t.charAt(0).toUpperCase() + t.slice(1)}`;
      changelog += `#### ${label}\n\n`;
      for (const c of filtered) changelog += `${formatChangelogLine(c)}\n`;
      changelog += '\n';
    }
  }

  if (unscoped.length > 0) {
    changelog += '### Root\n\n';
    const typeOrder = [
      'breaking',
      'feat',
      'fix',
      'perf',
      'refactor',
      'style',
      'docs',
      'test',
      'chore',
      'ci',
      'security',
      'other',
    ];
    for (const t of typeOrder) {
      const filtered = unscoped.filter(c => c.type === t);
      if (filtered.length === 0) continue;
      const label = t === 'breaking' ? '💥 Breaking' : `${t.charAt(0).toUpperCase() + t.slice(1)}`;
      changelog += `#### ${label}\n\n`;
      for (const c of filtered) changelog += `${formatChangelogLine(c)}\n`;
      changelog += '\n';
    }
  }

  if (!args.dryRun) {
    const changelogPath = join(ROOT, 'CHANGELOG.md');
    let existing = '';
    if (existsSync(changelogPath)) {
      existing = readFileSync(changelogPath, 'utf-8');
    }
    writeFileSync(changelogPath, changelog + (existing ? `\n${existing}` : ''), 'utf-8');
  }

  // Output summary
  console.log(`\n  ── Release ${newVersion} ──\n`);
  if (args.dryRun) console.log(`  ⚠️  Dry run — no files written\n`);
  else console.log(`  ✓ CHANGELOG.md updated\n`);
  if (bumps.length > 0) {
    console.log('  Package bumps:');
    for (const b of bumps) {
      console.log(`    ${b.pkg.padEnd(35)} ${b.oldVersion} → ${b.newVersion} (${b.type})`);
    }
    console.log();
  }
  console.log(`  Root: ${oldRootVer} → ${newVersion} (${rootBump})\n`);

  // ── Publish (commit, tag, push) ──
  if (args.publish && !args.dryRun) {
    console.log('\n  ── Publishing release ──\n');

    // Generate docs
    console.log('  → Generating documentation...');
    run('npm run docs:generate');

    // Stage all changes
    console.log('  → Staging files...');
    run('git add -A');

    // Commit
    const commitMsg = `:rocket:(release): v${newVersion}`;
    console.log(`  → Committing: ${commitMsg}`);
    run(`git commit --no-verify -m "${commitMsg}"`);

    // Tag
    console.log(`  → Tagging v${newVersion}...`);
    run(`git tag -a v${newVersion} -m "${commitMsg}"`);

    // Push
    console.log('  → Pushing commits and tags...');
    run('git push --follow-tags');
    console.log(`  ✓ Release v${newVersion} published.\n`);
  }
}

main();
