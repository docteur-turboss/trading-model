import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GITMOJIS = [
  { emoji: ':sparkles:', code: '✨', name: 'feat', desc: 'New feature' },
  { emoji: ':label:', code: '🏷️', name: 'feat-types', desc: 'Add types' },
  { emoji: ':tada:', code: '🎉', name: 'feat-init', desc: 'Initial commit' },

  { emoji: ':bug:', code: '🐛', name: 'fix', desc: 'Bug fix' },
  { emoji: ':ambulance:', code: '🚑', name: 'fix-hotfix', desc: 'Critical hotfix' },
  { emoji: ':pencil2:', code: '✏️', name: 'fix-typo', desc: 'Fix typo' },
  { emoji: ':fire:', code: '🔥', name: 'fix-remove', desc: 'Remove code/files' },

  { emoji: ':memo:', code: '📝', name: 'docs', desc: 'Documentation' },
  { emoji: ':books:', code: '📚', name: 'docs-api', desc: 'API docs' },

  { emoji: ':lipstick:', code: '💄', name: 'style', desc: 'UI/formatting' },
  { emoji: ':shirt:', code: '👕', name: 'style-lint', desc: 'Lint fix' },

  { emoji: ':recycle:', code: '♻️', name: 'refactor', desc: 'Code restructuring' },
  { emoji: ':wastebasket:', code: '🗑️', name: 'refactor-depr', desc: 'Deprecate code' },

  { emoji: ':zap:', code: '⚡', name: 'perf', desc: 'Performance' },
  { emoji: ':rocket:', code: '🚀', name: 'perf-deploy', desc: 'Deploy / perf' },

  { emoji: ':white_check_mark:', code: '✅', name: 'test', desc: 'Add tests' },
  { emoji: ':test_tube:', code: '🧪', name: 'test-exp', desc: 'Experimental test' },
  { emoji: ':boom:', code: '💥', name: 'test-breaking', desc: 'Breaking change' },

  { emoji: ':wrench:', code: '🔧', name: 'chore', desc: 'Config/tooling' },
  { emoji: ':pushpin:', code: '📌', name: 'chore-pin', desc: 'Pin dependencies' },
  { emoji: ':arrow_up:', code: '⬆️', name: 'chore-up', desc: ' Upgrade deps' },
  { emoji: ':arrow_down:', code: '⬇️', name: 'chore-down', desc: 'Downgrade deps' },

  { emoji: ':construction_worker:', code: '👷', name: 'ci', desc: 'CI/CD' },
  { emoji: ':green_heart:', code: '💚', name: 'ci-fix', desc: 'Fix CI build' },

  { emoji: ':lock:', code: '🔒', name: 'security', desc: 'Security fix' },
  { emoji: ':shield:', code: '🛡️', name: 'security-audit', desc: 'Security audit' },
];

const SCOPES = [
  'auth',
  'scraper',
  'api',
  'wallet',
  'core',
  'deps',
  'discovery',
  'broker',
  'trainer',
  'router',
  'common',
  'config',
  'database',
  'middleware',
  'utils',
  'types',
  'address-manager',
  'message-manager',
  'financial-scraper',
  'trader-trainer',
  'discovery-server',
  'docs',
  'deps',
  'github-actions',
  'husky',
  'eslint',
];

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n  ── Gitmoji Commit ──\n');

  const groups = [
    { title: '✨ Features', start: 0, end: 2 },
    { title: '🐛 Fixes', start: 3, end: 6 },
    { title: '📝 Documentation', start: 7, end: 8 },
    { title: '💄 Style', start: 9, end: 10 },
    { title: '♻️ Refactor', start: 11, end: 12 },
    { title: '⚡ Performance', start: 13, end: 14 },
    { title: '✅ Tests', start: 15, end: 17 },
    { title: '🔧 Chore', start: 18, end: 21 },
    { title: '👷 CI', start: 22, end: 23 },
    { title: '🔒 Security', start: 24, end: 25 },
  ];

  for (const g of groups) {
    console.log(`  ${g.title}`);
    for (let i = g.start; i <= g.end; i++) {
      const e = GITMOJIS[i];
      console.log(`    ${String(i + 1).padEnd(3)} ${e.code} ${e.emoji.padEnd(20)} ${e.desc}`);
    }
    console.log();
  }

  const choice = await ask('  Number: ');
  const idx = parseInt(choice, 10) - 1;
  if (idx < 0 || idx >= GITMOJIS.length) {
    console.error('  ✗ Invalid choice');
    rl.close();
    process.exit(1);
  }

  const selected = GITMOJIS[idx];
  console.log(`\n  → ${selected.code} ${selected.emoji}  ${selected.desc}\n`);

  console.log('  Scopes: ' + SCOPES.join(', '));
  const scope = (await ask('  Scope (optional): ')).trim();

  const subject = (await ask('  Subject (required): ')).trim();
  if (!subject) {
    console.error('  ✗ Subject is required');
    rl.close();
    process.exit(1);
  }

  const scopePart = scope ? `(${scope})` : '';
  const breaking = (await ask('  Breaking change? (y/N): ')).trim().toLowerCase();
  const breakingMarker = breaking === 'y' || breaking === 'yes' ? '!' : '';

  const header = `${selected.emoji}${scopePart}${breakingMarker}: ${subject}`;

  console.log('\n  ── Body (optional) ──');
  console.log('  Type your commit body. Press Enter twice (empty line) to finish.\n');
  const bodyLines = [];
  while (true) {
    const line = await ask('  ');
    if (line === '') break;
    bodyLines.push(line);
  }

  console.log('\n  ── Footer (optional) ──');
  console.log('  Examples: "Closes #42", "BREAKING CHANGE: api v2", "Refs #12"\n');

  const footers = [];
  while (true) {
    const line = (await ask('  Footer (empty to finish): ')).trim();
    if (line === '') break;
    footers.push(line);
  }

  rl.close();

  const parts = [header];
  if (bodyLines.length > 0) {
    parts.push('');
    parts.push(...bodyLines);
  }
  if (footers.length > 0) {
    parts.push('');
    parts.push(...footers);
  }
  const fullMessage = parts.join('\n');

  console.log('\n  ─────────────────────────────');
  console.log(fullMessage);
  console.log('  ─────────────────────────────\n');

  try {
    const tmpFile = join(tmpdir(), `git-commit-msg-${Date.now()}.txt`);
    writeFileSync(tmpFile, fullMessage, 'utf-8');
    execSync(`git commit -F "${tmpFile}"`, { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

main();
