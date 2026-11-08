/**
 * Keeps the ADRs honest about the runtime (audit 13.09: ADR ↔ runtime drift).
 *
 * An ADR cannot prove itself, so this check does not read its prose. It makes
 * every live decision name what verifies it, and keeps the supersession graph
 * and the index consistent, so a decision replaced in code cannot stay
 * "Accepted" unnoticed (ADR-0002/0008 did after ADR-0012 removed their code).
 *
 * Rules (each violation fails the check):
 *   - every docs/adr/NNNN-*.md has a `**Status:**` line: Proposed, Accepted,
 *     Implemented, Deprecated, or `Superseded by [ADR-NNNN](./NNNN-....md)`
 *   - supersession goes both ways: a superseded ADR links to an existing ADR
 *     whose `**Supersedes:**` line links back, and every `**Supersedes:**`
 *     target is marked superseded by that ADR
 *   - an Accepted or Implemented ADR has a `**Verified by:**` line naming at
 *     least one check, each written in backticks:
 *       `bun run <script>`  a root package.json script
 *       `path/to/x.spec.ts` a test file (run by the test suites)
 *       `path/to/script`    a file run by pre-push, a workflow or a package
 *                           script (an unreferenced script verifies nothing)
 *     or starting with `manual review YYYY-MM-DD` when no automated check can
 *     prove the decision (its backticked paths must still exist)
 *   - docs/adr/README.md lists every ADR once, with the same status, and links
 *     only to existing files
 *
 *   - every relative link in a tracked *.md (docs/architecture/code/ excluded,
 *     it is generated) points at an existing file or folder (issue #372)
 *

 * - every PascalCase `Name` cited in code in docs/architecture/*.md exists in
 *   services/ or packages/ (issue #498)
 *
 * A manual review older than MANUAL_REVIEW_MAX_AGE_DAYS is reported as a
 * warning, not a failure: the check must not break a build on a date.
 *
 * Usage: node scripts/adr-check.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADR_DIR = join(ROOT, 'docs/adr');
const INDEX_PATH = join(ADR_DIR, 'README.md');
const ADR_FILE = /^(\d{4})-[a-z0-9-]+\.md$/;
const LIVE_STATUSES = new Set(['Accepted', 'Implemented']);
const PLAIN_STATUSES = new Set(['Proposed', 'Accepted', 'Implemented', 'Deprecated']);
const ADR_LINK = /\[ADR-(\d{4})\]\(\.\/(\d{4}-[a-z0-9-]+\.md)\)/g;
const TEST_FILE = /\.(spec|test)\.[a-z]+$/;
const MANUAL_REVIEW = /^manual review (\d{4}-\d{2}-\d{2})\b/;
const MANUAL_REVIEW_MAX_AGE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

const errors = [];
const warnings = [];

function headerField(text, name) {
  const prefix = `**${name}:**`;
  const line = text.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  return line === undefined ? undefined : line.slice(prefix.length).trim();
}

function adrLinks(value) {
  return [...(value ?? '').matchAll(ADR_LINK)].map(([, number, file]) => ({ number, file }));
}

function readAdrs() {
  const adrs = new Map();
  for (const file of readdirSync(ADR_DIR).sort()) {
    const match = ADR_FILE.exec(file);
    if (!match) continue;
    const text = readFileSync(join(ADR_DIR, file), 'utf8');
    const status = headerField(text, 'Status');
    adrs.set(file, {
      file,
      number: match[1],
      status,
      kind: status?.startsWith('Superseded by') ? 'Superseded' : status,
      supersededBy: status?.startsWith('Superseded by') ? adrLinks(status) : [],
      supersedes: adrLinks(headerField(text, 'Supersedes')),
      verifiedBy: headerField(text, 'Verified by'),
    });
  }
  return adrs;
}

/** Every file a gate can run: pre-push, workflows, root package scripts. */
function gateSources() {
  const workflows = join(ROOT, '.github/workflows');
  const sources = [
    readFileSync(join(ROOT, '.husky/pre-push'), 'utf8'),
    ...readdirSync(workflows).map((file) => readFileSync(join(workflows, file), 'utf8')),
    Object.values(packageScripts()).join('\n'),
  ];
  return sources.join('\n');
}

function packageScripts() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {};
}

function checkStatus(adr, adrs) {
  if (adr.status === undefined) {
    errors.push(`${adr.file}: no **Status:** line`);
    return;
  }
  if (adr.kind !== 'Superseded' && !PLAIN_STATUSES.has(adr.status)) {
    errors.push(`${adr.file}: unknown status "${adr.status}" (expected ${[...PLAIN_STATUSES].join(', ')} or Superseded by [ADR-NNNN](./NNNN-....md))`);
  }
  if (adr.kind === 'Superseded' && adr.supersededBy.length === 0) {
    errors.push(`${adr.file}: "Superseded by" must link the successor as [ADR-NNNN](./NNNN-....md)`);
  }
  for (const successor of adr.supersededBy) {
    const target = adrs.get(successor.file);
    if (!target) {
      errors.push(`${adr.file}: superseded by ${successor.file}, which does not exist`);
    } else if (!target.supersedes.some((link) => link.file === adr.file)) {
      errors.push(`${adr.file}: superseded by ${successor.file}, whose **Supersedes:** line does not link back`);
    }
  }
  for (const predecessor of adr.supersedes) {
    const target = adrs.get(predecessor.file);
    if (!target) {
      errors.push(`${adr.file}: supersedes ${predecessor.file}, which does not exist`);
    } else if (!target.supersededBy.some((link) => link.file === adr.file)) {
      errors.push(`${adr.file}: supersedes ${predecessor.file}, whose status is "${target.status}" instead of "Superseded by [ADR-${adr.number}](./${adr.file})"`);
    }
  }
}

function checkVerifiedBy(adr, scripts, gates, today) {
  if (!LIVE_STATUSES.has(adr.status)) return;
  if (!adr.verifiedBy) {
    errors.push(`${adr.file}: ${adr.status} but no **Verified by:** line (name the test, script or gate that proves it, or "manual review YYYY-MM-DD")`);
    return;
  }
  const review = MANUAL_REVIEW.exec(adr.verifiedBy);
  const checks = [...adr.verifiedBy.matchAll(/`([^`]+)`/g)].map(([, check]) => check);
  if (!review && checks.length === 0) {
    errors.push(`${adr.file}: **Verified by:** names no check in backticks`);
  }
  if (review) {
    const ageDays = Math.floor((today - Date.parse(review[1])) / DAY_MS);
    if (Number.isNaN(ageDays)) errors.push(`${adr.file}: invalid manual review date ${review[1]}`);
    else if (ageDays > MANUAL_REVIEW_MAX_AGE_DAYS) warnings.push(`${adr.file}: last manual review ${review[1]} (${ageDays} days ago), re-check it against the runtime`);
  }
  for (const check of checks) {
    const script = /^bun run ([\w:.-]+)$/.exec(check);
    if (script) {
      if (!(script[1] in scripts)) errors.push(`${adr.file}: verified by \`${check}\`, but package.json has no "${script[1]}" script`);
      continue;
    }
    if (!existsSync(join(ROOT, check))) {
      errors.push(`${adr.file}: verified by \`${check}\`, which does not exist`);
    } else if (!review && !TEST_FILE.test(check) && !gates.includes(check)) {
      errors.push(`${adr.file}: verified by \`${check}\`, which no gate runs (pre-push, workflow or package script)`);
    }
  }
}

function checkIndex(adrs) {
  const rows = new Map();
  for (const line of readFileSync(INDEX_PATH, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const links = [...line.matchAll(ADR_LINK)];
    if (links.length === 0) continue;
    const [, , file] = links[0];
    const cells = line.split('|').map((cell) => cell.trim());
    if (rows.has(file)) errors.push(`README.md: ${file} listed twice`);
    rows.set(file, cells[3]);
  }
  for (const [file, status] of rows) {
    const adr = adrs.get(file);
    if (!adr) errors.push(`README.md: links ${file}, which does not exist`);
    else if (status !== adr.status) errors.push(`README.md: ${file} listed as "${status}", the ADR says "${adr.status}"`);
  }
  for (const file of adrs.keys()) {
    if (!rows.has(file)) errors.push(`README.md: ${file} is not in the index`);
  }
}
/** Fails on a relative Markdown link whose target is missing (external URLs and anchors skipped). */
function checkMarkdownLinks() {
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((f) => f && !f.startsWith('docs/architecture/code/') && existsSync(join(ROOT, f)));
  for (const file of files) {
    // shortcut: fenced code is not stripped, a link-like snippet in a fence must resolve too
    const text = readFileSync(join(ROOT, file), 'utf8').replace(/`[^`\n]*`/g, ''); // inline code is not a link
    for (const [, raw] of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(raw)) continue;
      const target = decodeURI(raw.split('#')[0].split('?')[0]);
      if (target && !existsSync(resolve(ROOT, dirname(file), target))) errors.push(`${file}: broken link ${raw}`);
    }
  }
}

/** A PascalCase symbol in backticks, acronym segments included (`FooBAR`); linear, no nested quantifier (CodeQL). */
const SYMBOL_PATTERN = /`([A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*)`/g;
// Self-check: a narrower pattern silently stops checking the symbols it misses.
const cites = (text) => [...text.matchAll(SYMBOL_PATTERN)].map(([, name]) => name);
assert.deepEqual(cites('`EndpointResolver` `FooBAR` `S3AnchorStore` `Foo` `HTTP` `fooBar`'), ['EndpointResolver', 'FooBAR', 'S3AnchorStore']);

/** Names an architecture page may cite in code that are not symbols of services/ or packages/. */
const SYMBOL_EXCEPTIONS = new Set(['EnumEventMessage']); // historical enum, named on purpose as removed
/** Fails on a PascalCase `Name` cited in docs/architecture/*.md that no file of services/ or packages/ mentions. */
function checkArchitectureSymbols() {
  const dir = join(ROOT, 'docs/architecture');
  const pages = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const cited = new Map();
  for (const page of pages) {
    const text = readFileSync(join(dir, page), 'utf8');
    for (const [, name] of text.matchAll(SYMBOL_PATTERN)) {
      if (!SYMBOL_EXCEPTIONS.has(name)) cited.set(name, `docs/architecture/${page}`);
    }
  }
  for (const [name, page] of cited) {
    try {
      execFileSync('git', ['grep', '-qw', name, '--', 'services', 'packages'], { cwd: ROOT });
    } catch {
      errors.push(`${page}: \`${name}\` is not defined in services/ or packages/ (fix the page, or list it in SYMBOL_EXCEPTIONS)`);
    }
  }
}

const adrs = readAdrs();
const scripts = packageScripts();
const gates = gateSources();
const today = Date.now();
for (const adr of adrs.values()) {
  checkStatus(adr, adrs);
  checkVerifiedBy(adr, scripts, gates, today);
}
checkIndex(adrs);
checkMarkdownLinks();
checkArchitectureSymbols();

for (const warning of warnings) console.warn(`  ! ${warning}`);
if (errors.length > 0) {
  console.error(`ADR check failed (${errors.length}):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}
const live = [...adrs.values()].filter((adr) => LIVE_STATUSES.has(adr.status)).length;
console.log(`ADR check OK: ${adrs.size} ADRs, ${live} live, each with a check; supersession and index consistent`);
