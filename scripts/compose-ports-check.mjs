#!/usr/bin/env node
// Gate (issue #844): every `ports:` entry of every docker-compose*.yml binds 127.0.0.1.
// A short entry ("9090:9090", "3000") or a long one without `host_ip: 127.0.0.1` publishes on
// every interface. `expose:` and `ports: !reset []` publish nothing and are ignored.
// Plain text parsing (no YAML dependency, CRLF-safe), like scripts/observability-gate.mjs.
//
// Usage: node scripts/compose-ports-check.mjs [rootDir]
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Exceptions: "<repo-relative file>:<line>" of a `ports:` item allowed to publish wider. Keep empty.
export const EXCEPTIONS = [];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const LOOPBACK = '127.0.0.1';

function composeFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) composeFiles(join(dir, e.name), out);
    } else if (/^docker-compose.*\.ya?ml$/.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

const indentOf = (l) => l.length - l.trimStart().length;
const unquote = (s) => s.trim().replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');

/** Returns `[{ line, entry }]` for each `ports:` item of `text` that does not bind 127.0.0.1. */
export function wideBindings(text) {
  const lines = text.split(/\r?\n/);
  const bad = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)ports:\s*(.*)$/);
    if (!m) continue;
    const rest = m[2].replace(/(^|\s)#.*$/, '').replace(/^!override\s+/, '').trim();
    if (rest === '!reset []') continue;
    if (rest) {
      // Inline flow `ports: [a, b]`; any other value fails closed.
      // shortcut: items split on commas, so a comma inside a quoted item is misread (fails closed); upgrade with a YAML parser.
      const flow = rest.match(/^\[(.*)\]$/);
      const items = flow ? flow[1].split(',').map(unquote).filter(Boolean) : [rest];
      for (const entry of items) if (!flow || !entry.startsWith(`${LOOPBACK}:`)) bad.push({ line: i + 1, entry });
      continue;
    }
    const base = m[1].length;
    let j = i + 1;
    // Items: lines deeper than `ports:`, or a `-` at the same indent (compact YAML).
    while (j < lines.length) {
      const l = lines[j];
      if (l.trim() === '' || l.trim().startsWith('#')) { j++; continue; }
      if (indentOf(l) < base || (indentOf(l) === base && !l.trimStart().startsWith('- '))) break;
      if (!l.trimStart().startsWith('- ')) { j++; continue; }
      const itemIndent = indentOf(l);
      let k = j + 1;
      while (k < lines.length && (lines[k].trim() === '' || indentOf(lines[k]) > itemIndent)) k++;
      const block = lines.slice(j, k).join('\n');
      const first = unquote(l.trimStart().slice(2));
      const hostIp = block.match(/host_ip:\s*(\S+)/);
      const isLong = /^[\w-]+:\s/.test(first) || /^[\w-]+:$/.test(first);
      const ok = isLong ? hostIp && unquote(hostIp[1]) === LOOPBACK : first.startsWith(`${LOOPBACK}:`);
      if (!ok) bad.push({ line: j + 1, entry: first });
      j = k;
    }
    i = j - 1;
  }
  return bad;
}

if (process.argv[1]?.endsWith('compose-ports-check.mjs')) {
  const root = resolve(process.argv[2] ?? join(import.meta.dirname, '..'));
  const errors = [];
  for (const f of composeFiles(root)) {
    const rel = relative(root, f).replaceAll('\\', '/');
    for (const { line, entry } of wideBindings(readFileSync(f, 'utf8'))) {
      if (!EXCEPTIONS.includes(`${rel}:${line}`)) errors.push(`${rel}:${line}: port "${entry}" is not bound to ${LOOPBACK}`);
    }
  }
  if (errors.length) {
    console.error(`compose-ports-check: ${errors.length} port(s) published on every interface (issue #844):\n${errors.join('\n')}`);
    process.exit(1);
  }
  console.log('compose-ports-check: all published ports bind 127.0.0.1');
}
