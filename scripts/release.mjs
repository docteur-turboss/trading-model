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
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
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
  writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  return oldVersion;
}

function formatChangelogLine(c) {
  const scope = c.scope ? `**${c.scope}:** ` : '';
  return `- ${c.hash} ${scope}${c.subject}`;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('\n  ⚠️  DRY RUN — no files will be modified\n');

  const lastTag = run('git describe --tags --abbrev=0 2>/dev/null');
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  let rawCommits;

  if (lastTag) {
    rawCommits = run(`git log ${range} --format="%H %s" --no-merges`);
    console.log(`\n  Since tag: ${lastTag}`);
  } else {
    rawCommits = run('git log --format="%H %s" --no-merges');
    console.log('\n  No tags found — using full history');
  }

  const allCommits = parseCommits(rawCommits);
  if (allCommits.length === 0) {
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

  // Bump versions per package
  const bumps = [];
  for (const [scope, commits] of Object.entries(scoped)) {
    const pkgPath = SCOPE_TO_PACKAGE[scope];
    if (!pkgPath) continue;
    const type = getBumpType(commits);
    const filePath = join(ROOT, pkgPath, 'package.json');
    const pkg = JSON.parse(readFileSync(filePath, 'utf-8'));
    const newVersion = bumpVersion(pkg.version, type);
    const oldVersion = dryRun ? pkg.version : updatePackageJson(pkgPath, newVersion);
    bumps.push({ scope, pkg: pkg.name, path: pkgPath, oldVersion, newVersion, type });
  }

  // Root version bump (overall project)
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  const rootBump = getBumpType(allCommits);
  const oldRootVer = rootPkg.version;
  const newRootVer = bumpVersion(rootPkg.version, rootBump);
  if (!dryRun) {
    rootPkg.version = newRootVer;
    writeFileSync(join(ROOT, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n', 'utf-8');
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

  if (!dryRun) {
    const changelogPath = join(ROOT, 'CHANGELOG.md');
    let existing = '';
    if (existsSync(changelogPath)) {
      existing = readFileSync(changelogPath, 'utf-8');
    }
    writeFileSync(changelogPath, changelog + (existing ? '\n' + existing : ''), 'utf-8');
  }

  // Output summary
  console.log(`\n  ── Release ${newVersion} ──\n`);
  if (dryRun) console.log(`  ⚠️  Dry run — no files written\n`);
  else console.log(`  ✓ CHANGELOG.md updated\n`);
  if (bumps.length > 0) {
    console.log('  Package bumps:');
    for (const b of bumps) {
      console.log(`    ${b.pkg.padEnd(35)} ${b.oldVersion} → ${b.newVersion} (${b.type})`);
    }
    console.log();
  }
  console.log(`  Root: ${oldRootVer} → ${newVersion} (${rootBump})\n`);
}

main();
