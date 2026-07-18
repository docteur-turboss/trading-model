import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cursorTo, clearScreenDown } from 'node:readline';

const GITMOJIS = [
  { emoji: ':sparkles:', code: '✨', name: 'feat', desc: 'New feature' },
  { emoji: ':label:', code: '🏷️', name: 'feat-types', desc: ' Add types' },
  { emoji: ':tada:', code: '🎉', name: 'feat-init', desc: 'Initial commit' },
  { emoji: ':bug:', code: '🐛', name: 'fix', desc: 'Bug fix' },
  { emoji: ':ambulance:', code: '🚑', name: 'fix-hotfix', desc: 'Critical hotfix' },
  { emoji: ':pencil2:', code: '✏️', name: 'fix-typo', desc: ' Fix typo' },
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
  { emoji: ':arrow_down:', code: '⬇️', name: 'chore-down', desc: ' Downgrade deps' },
  { emoji: ':construction_worker:', code: '👷', name: 'ci', desc: 'CI/CD' },
  { emoji: ':green_heart:', code: '💚', name: 'ci-fix', desc: 'Fix CI build' },
  { emoji: ':lock:', code: '🔒', name: 'security', desc: 'Security fix' },
  { emoji: ':shield:', code: '🛡️', name: 'security-audit', desc: ' Security audit' },
];

const CATEGORIES = [
  { title: '✨ Features', icon: '✨', start: 0, end: 2 },
  { title: '🐛 Fixes', icon: '🐛', start: 3, end: 6 },
  { title: '📝 Documentation', icon: '📝', start: 7, end: 8 },
  { title: '💄 Style', icon: '💄', start: 9, end: 10 },
  { title: '♻️  Refactor', icon: '♻️', start: 11, end: 12 },
  { title: '⚡ Performance', icon: '⚡', start: 13, end: 14 },
  { title: '✅ Tests', icon: '✅', start: 15, end: 17 },
  { title: '🔧 Chore', icon: '🔧', start: 18, end: 21 },
  { title: '👷 CI', icon: '👷', start: 22, end: 23 },
  { title: '🔒 Security', icon: '🔒', start: 24, end: 25 },
];

const SCOPES = [
  'address-manager',
  'admin-interface',
  'api',
  'api-gateway',
  'audit-logger',
  'auth',
  'broker',
  'certificate-authority',
  'certificate-client',
  'certificate-utils',
  'common',
  'config',
  'core',
  'database',
  'deps',
  'discovery',
  'discovery-server',
  'dlq-service',
  'docs',
  'docker',
  'examples',
  'financial-scraper',
  'github-actions',
  'husky',
  'k8s',
  'message-manager',
  'middleware',
  'multiple',
  'observability',
  'release',
  'router',
  'scraper',
  'scripts',
  'tests',
  'trader-trainer',
  'trainer',
  'types',
  'utils',
  'validation',
  'wallet',
];

const stdin = process.stdin;
const stdout = process.stdout;

function clearScreen() {
  cursorTo(stdout, 0, 0);
  clearScreenDown(stdout);
}

function hideCursor() {
  stdout.write('\x1B[?25l');
}

function showCursor() {
  stdout.write('\x1B[?25h');
}

function rawMode(enable) {
  if (stdin.isTTY) stdin.setRawMode(enable);
}

const KEY_MAP = {
  '\x1B[A': 'UP',
  '\x1B[B': 'DOWN',
  '\r': 'ENTER',
  '\n': 'ENTER',
  '\x1B': 'ESC',
};

function keypress() {
  return new Promise(resolve => {
    const onData = buf => {
      stdin.removeListener('data', onData);
      const key = buf.toString();
      if (key === '\x03') process.exit(0);
      resolve(KEY_MAP[key] ?? key);
    };
    stdin.once('data', onData);
  });
}

async function textInput(label) {
  rawMode(true);
  hideCursor();
  let input = '';
  while (true) {
    clearScreen();
    stdout.write(`\n  ${label}: ${input}\n\n`);
    stdout.write('  Enter confirm · Esc cancel\n');
    const key = await keypress();
    if (key === 'ENTER') {
      rawMode(true);
      hideCursor();
      return input.trim();
    }
    if (key === 'ESC') {
      rawMode(true);
      hideCursor();
      return null;
    }
    if (key === '\x7F' || key === '\b') {
      input = input.slice(0, -1);
    } else {
      for (const ch of key) {
        if (ch.charCodeAt(0) >= 32) {
          input += ch;
        }
      }
    }
  }
}

const PAGE_SIZE = 8;

function btnWide(label, width) {
  const inner = ` ${label} `;
  const pad = Math.max(0, width - inner.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;

  return `${' '.repeat(left)}${inner}${' '.repeat(right)}`;
}

function renderMenu(title, items, cursor, offset, renderItem, searchBuffer) {
  clearScreen();
  stdout.write(`\n  ${title}\n\n`);

  const end = Math.min(offset + PAGE_SIZE, items.length);
  const maxW = items.reduce((m, _, i) => Math.max(m, renderItem(items[i], i).length), 0);
  const rowW = Math.max(title.length, maxW + 2);

  const hasUp = offset > 0;
  const hasDn = end < items.length;

  if (hasUp) {
    stdout.write(`  ${btnWide('▲', rowW)}\n`);
  } else {
    stdout.write(`  ${' '.repeat(rowW)}\n`);
  }
  for (let i = offset; i < end; i++) {
    const prefix = i === cursor ? '▸' : ' ';
    stdout.write(`  ${prefix} ${renderItem(items[i], i).padEnd(rowW - 2)}\n`);
  }
  if (hasDn) {
    stdout.write(`  ${btnWide('▼', rowW)}\n`);
  } else {
    stdout.write(`  ${' '.repeat(rowW)}\n`);
  }
  if (searchBuffer) {
    stdout.write(`\n  Search: ${searchBuffer}\n`);
  }
  stdout.write('\n  ↑↓ navigate · Enter select · Esc back · Type to search\n');
}

const CONTINUE = Symbol('CONTINUE');

const MENU_ACTIONS = {
  UP: (cursor, offset, items) => {
    if (cursor > 0) {
      cursor--;
      if (cursor < offset) offset--;
    }
    return { type: CONTINUE, cursor, offset };
  },
  DOWN: (cursor, offset, items) => {
    if (cursor < items.length - 1) {
      cursor++;
      if (cursor >= offset + PAGE_SIZE) offset++;
    }
    return { type: CONTINUE, cursor, offset };
  },
  ENTER: (cursor, offset, items) => ({ type: 'return', value: items[cursor] }),
  ESC: () => ({ type: 'return', value: null }),
};

function findItemIndex(items, renderItem, searchBuffer) {
  const lower = searchBuffer.toLowerCase();
  let idx = items.findIndex((item, i) => {
    const label = renderItem(item, i).toLowerCase();
    return label.startsWith(lower);
  });
  if (idx === -1) {
    idx = items.findIndex((item, i) => {
      const label = renderItem(item, i).toLowerCase();
      return label.includes(lower);
    });
  }
  return idx;
}

async function pickFromList(title, items, renderItem) {
  let cursor = 0;
  let offset = 0;
  let searchBuffer = '';
  rawMode(true);
  hideCursor();
  while (true) {
    renderMenu(title, items, cursor, offset, renderItem, searchBuffer);
    const key = await keypress();
    if (key === 'UP' || key === 'DOWN') {
      searchBuffer = '';
      const result = MENU_ACTIONS[key](cursor, offset, items);
      if (result.type === 'return') return result.value;
      cursor = result.cursor;
      offset = result.offset;
    } else if (key === 'ENTER') {
      return items[cursor];
    } else if (key === 'ESC') {
      return null;
    } else if (key === '\x7F' || key === '\b') {
      searchBuffer = searchBuffer.slice(0, -1);
      if (searchBuffer) {
        const idx = findItemIndex(items, renderItem, searchBuffer);
        if (idx !== -1) {
          cursor = idx;
          if (cursor < offset) offset = cursor;
          if (cursor >= offset + PAGE_SIZE) offset = cursor - PAGE_SIZE + 1;
        }
      } else {
        cursor = 0;
        offset = 0;
      }
    } else if (key.length === 1 && /[a-zA-Z0-9_-]/.test(key)) {
      searchBuffer += key.toLowerCase();
      const idx = findItemIndex(items, renderItem, searchBuffer);
      if (idx !== -1) {
        cursor = idx;
        if (cursor < offset) offset = cursor;
        if (cursor >= offset + PAGE_SIZE) offset = cursor - PAGE_SIZE + 1;
      }
    }
  }
}

async function multiLineInput(label) {
  rawMode(true);
  hideCursor();
  const lines = [];
  let currentLine = '';
  while (true) {
    clearScreen();
    stdout.write(`\n${label}\n`);
    stdout.write('(Empty line to finish)\n\n');
    for (const line of lines) {
      stdout.write(`  ${line}\n`);
    }
    stdout.write(`> ${currentLine}\n`);
    stdout.write('\n  Enter next line · Empty Enter finish · Esc cancel\n');
    const key = await keypress();
    if (key === 'ENTER') {
      if (!currentLine.trim() && lines.length > 0) {
        rawMode(true);
        hideCursor();
        return lines;
      }
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = '';
      } else {
        rawMode(true);
        hideCursor();
        return lines;
      }
    } else if (key === 'ESC') {
      rawMode(true);
      hideCursor();
      return [];
    } else if (key === '\x7F' || key === '\b') {
      currentLine = currentLine.slice(0, -1);
    } else {
      for (const ch of key) {
        if (ch === '\r' || ch === '\n') {
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
            currentLine = '';
          }
        } else if (ch.charCodeAt(0) >= 32) {
          currentLine += ch;
        }
      }
    }
  }
}

async function main() {
  // Step 1: pick category
  const category = await pickFromList(
    '── Gitmoji Commit ──  [Category]',
    CATEGORIES,
    cat => cat.title
  );
  if (!category) {
    clearScreen();
    showCursor();
    rawMode(false);
    stdout.write('\nCancelled.\n');
    process.exit(0);
  }

  // Step 2: pick emoji within category
  const emojis = GITMOJIS.slice(category.start, category.end + 1);
  const selected = await pickFromList(
    `── ${category.icon} ${category.title.replace(/^[^\s]+\s/, '')} ──`,
    emojis,
    e => `${e.code}  ${e.desc}`
  );
  if (!selected) {
    // Esc → back to category selection
    return main();
  }

  clearScreen();
  stdout.write(`\n  → ${selected.code} ${selected.desc}\n\n`);

  const scopeItems = [
    { value: '', label: '— none —' },
    ...SCOPES.map(s => ({ value: s, label: s })),
  ];
  const scopePick = await pickFromList('── Scope (optional) ──', scopeItems, s => s.label);
  if (!scopePick) {
    clearScreen();
    showCursor();
    rawMode(false);
    stdout.write('\nCancelled.\n');
    process.exit(0);
  }
  const scopePart = scopePick.value ? `(${scopePick.value})` : '';

  const subject = await textInput('Subject');
  if (!subject) {
    clearScreen();
    showCursor();
    rawMode(false);
    stdout.write('\nCancelled.\n');
    process.exit(0);
  }

  const breaking = await textInput('Breaking change? (y/N)');
  if (breaking === null) {
    clearScreen();
    showCursor();
    rawMode(false);
    stdout.write('\nCancelled.\n');
    process.exit(0);
  }
  const breakingFlag = ['y', 'yes'].includes(breaking.toLowerCase()) ? '!' : '';
  const header = `${selected.emoji}${scopePart}${breakingFlag}: ${subject}`;

  const body = await multiLineInput('Body');
  const footer = await multiLineInput('Footer');

  const parts = [header];
  if (body.length) {
    parts.push('');
    parts.push(...body);
  }
  if (footer.length) {
    parts.push('');
    parts.push(...footer);
  }
  const commitMessage = parts.join('\n');

  clearScreen();
  stdout.write('\n─────────────────────────────\n\n');
  stdout.write(commitMessage);
  stdout.write('\n\n─────────────────────────────\n');

  const confirm = await textInput('Commit? (Y/n)');
  if (confirm === null || ['n', 'no'].includes(confirm.toLowerCase())) {
    clearScreen();
    showCursor();
    rawMode(false);
    stdout.write('\nCancelled.\n');
    process.exit(0);
  }

  try {
    const file = join(tmpdir(), `git-commit-${Date.now()}.txt`);
    writeFileSync(file, commitMessage, 'utf8');
    rawMode(false);
    showCursor();
    execSync(`git commit -F "${file}"`, { stdio: 'inherit' });
    clearScreen();
    stdout.write('\nCommitted ✓\n');
  } catch {
    process.exit(1);
  } finally {
    rawMode(false);
    showCursor();
  }
  process.exit(0);
}

main();
