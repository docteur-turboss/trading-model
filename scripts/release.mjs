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

const TYPE_ORDER = [
  'breaking', 'feat', 'fix', 'perf', 'refactor', 'style',
  'docs', 'test', 'chore', 'ci', 'security', 'other',
];

function parseArgs() {
  const args = { dryRun: false, bump: null, version: null, publish: false };
  const argv = process.argv.slice(2);
  const BOOLEAN_FLAGS = { '--dry-run': 'dryRun', '--publish': 'publish' };
  const VALUE_FLAGS = { '--bump': 'bump', '--version': 'version' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag in VALUE_FLAGS) {
      args[VALUE_FLAGS[flag]] = argv[++i] || null;
    } else if (flag in BOOLEAN_FLAGS) {
      args[BOOLEAN_FLAGS[flag]] = true;
    }
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
  if (!args.publish || args.dryRun) return;
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

function collectCommits(args) {
  const lastTag = run('git describe --tags --abbrev=0');
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
  const allCommits = rawCommits ? parseCommits(rawCommits) : [];
  return { allCommits, lastTag };
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
  if (!args.dryRun) {
    rootPkg.version = args.version;
    writeFileSync(join(ROOT, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`, 'utf-8');
  }
  console.log(`\n  ── Release ${args.version} ──\n`);
  if (args.dryRun) console.log(`  ⚠️  Dry run — no files written\n`);
  else console.log(`  ✓ package.json updated`);
  console.log();
}

function resolveVersion(args, allCommits) {
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  const oldRootVer = rootPkg.version;
  const rootBump = args.bump || getBumpType(allCommits);
  const newVersion = bumpVersion(oldRootVer, rootBump);
  return { rootPkg, oldRootVer, rootBump, newVersion };
}

function bumpPackages(scoped, args, dryRun) {
  const bumps = [];
  for (const [scope, commits] of Object.entries(scoped)) {
    const pkgPath = SCOPE_TO_PACKAGE[scope];
    if (!pkgPath) continue;
    const type = args.bump || getBumpType(commits);
    const pkg = JSON.parse(readFileSync(join(ROOT, pkgPath, 'package.json'), 'utf-8'));
    const newVersion = bumpVersion(pkg.version, type);
    const oldVersion = dryRun ? pkg.version : updatePackageJson(pkgPath, newVersion);
    bumps.push({ scope, pkg: pkg.name, path: pkgPath, oldVersion, newVersion, type });
  }
  return bumps;
}

function bumpRoot(rootPkg, newVersion, dryRun) {
  if (dryRun) return;
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
  if (unscoped.length > 0) {
    changelog += writeChangelogSection(unscoped, 'Root');
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

function publishRelease(newVersion, args) {
  if (!args.publish || args.dryRun) return;
  console.log('\n  ── Publishing release ──\n');
  console.log('  → Generating documentation...');
  run('npm run docs:generate');
  console.log('  → Staging files...');
  run('git add -A');
  const commitMsg = `:rocket:(release): v${newVersion}`;
  console.log(`  → Committing: ${commitMsg}`);
  run(`git commit --no-verify -m "${commitMsg}"`);
  console.log(`  → Tagging v${newVersion}...`);
  run(`git tag -a v${newVersion} -m "${commitMsg}"`);
  console.log('  → Pushing commits and tags...');
  run('git push --follow-tags');
  console.log(`  ✓ Release v${newVersion} published.\n`);
}

function main() {
  const args = parseArgs();
  if (args.dryRun) console.log('\n  ⚠️  DRY RUN — no files will be modified\n');

  handlePublishMerge(args);

  const { allCommits } = collectCommits(args);
  if (!args.version && allCommits.length === 0) {
    console.log('  No new commits to release.\n');
    return;
  }

  if (args.version) {
    handleExplicitVersion(args);
    return;
  }

  const { scoped, unscoped } = groupByScope(allCommits);
  const { rootPkg, oldRootVer, rootBump, newVersion } = resolveVersion(args, allCommits);
  const bumps = bumpPackages(scoped, args, args.dryRun);
  bumpRoot(rootPkg, newVersion, args.dryRun);
  buildChangelog(bumps, scoped, unscoped, newVersion, args.dryRun);
  printSummary(bumps, oldRootVer, newVersion, rootBump, args.dryRun);
  publishRelease(newVersion, args);
}

main();
