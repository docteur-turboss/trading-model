import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const GITMOJIS = [
  { emoji: ':sparkles:', code: '✨', name: 'feat', desc: 'New feature' },
  { emoji: ':bug:', code: '🐛', name: 'fix', desc: 'Bug fix' },
  { emoji: ':memo:', code: '📝', name: 'docs', desc: 'Documentation' },
  { emoji: ':lipstick:', code: '💄', name: 'style', desc: 'Formatting' },
  { emoji: ':recycle:', code: '♻️', name: 'refactor', desc: 'Code restructuring' },
  { emoji: ':zap:', code: '⚡', name: 'perf', desc: 'Performance improvement' },
  { emoji: ':white_check_mark:', code: '✅', name: 'test', desc: 'Test additions' },
  { emoji: ':wrench:', code: '🔧', name: 'chore', desc: 'Dependencies, tooling' },
  { emoji: ':construction_worker:', code: '👷', name: 'ci', desc: 'CI/CD changes' },
  { emoji: ':rocket:', code: '🚀', name: 'release', desc: 'Release' },
  { emoji: ':lock:', code: '🔒', name: 'security', desc: 'Security fixes' },
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
  'common',
  'address-manager',
  'message-manager',
  'financial-scraper',
  'trader-trainer',
];

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n  Choose a gitmoji:\n');
  GITMOJIS.forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.code} ${g.emoji}  ${g.name.padEnd(10)} ${g.desc}`);
  });

  const choice = await ask('\n  Number: ');
  const idx = parseInt(choice, 10) - 1;
  if (idx < 0 || idx >= GITMOJIS.length) {
    console.error('  Invalid choice');
    rl.close();
    process.exit(1);
  }

  const selected = GITMOJIS[idx];
  console.log(`\n  Selected: ${selected.code} ${selected.emoji}  ${selected.desc}\n`);

  console.log('  Available scopes:', SCOPES.join(', '));
  const scope = (await ask('  Scope (optional, press Enter to skip): ')).trim();

  const subject = (await ask('  Subject: ')).trim();
  if (!subject) {
    console.error('  Subject is required');
    rl.close();
    process.exit(1);
  }

  rl.close();

  const scopePart = scope ? `(${scope})` : '';
  const fullMessage = `${selected.emoji}${scopePart}: ${subject}`;

  console.log(`\n  Commit message: ${fullMessage}\n`);

  try {
    execSync(`git commit -m "${fullMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

main();
