/**
 * Reports source code that no service entry point can reach, and the specs
 * that only exercise such code. Coverage counts every file under `src/`, so
 * unreachable code with green specs inflates it without protecting anything
 * that runs (audit 2026-09-13: 27% of src was unreachable).
 *
 * Entry points: each service's package.json `main` and `bin` (dist paths
 * mapped back to src; `bin` declares the CLIs run by operators, e.g.
 * audit-logger's chain-cli) and, for a browser workspace, its `index.html` script. Edges: static and dynamic
 * imports, require(), and `new Worker(path)`. Anything built from a computed
 * path is invisible here, so a hit is a lead to check, not a verdict.
 *
 * Static reachability says nothing about what runs (a cron that config
 * leaves disabled, a server no client connects to, are still reachable):
 * pair it with the E2E data-flow tests (ADR-0013, ADR-0029).
 *
 * Gate (`--max-lines <n>`, `bun run reach:check`): exits 1 when more than n
 * src lines are unreachable or when a spec only exercises unreachable code.
 * The threshold is the ADR-0029 baseline; lower it, never raise it to let new
 * dead code in: wire it to an entry point or remove it.
 *
 * Usage: node scripts/reachability.mjs [--list] [--max-lines <n>]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk as walkFiles } from './lib/fs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');
const MAX_LINES_ARG = process.argv.indexOf('--max-lines');
const MAX_LINES = MAX_LINES_ARG === -1 ? null : Number(process.argv[MAX_LINES_ARG + 1]);
if (MAX_LINES !== null && !Number.isInteger(MAX_LINES)) {
  console.error('--max-lines needs an integer');
  process.exit(2);
}
const SOURCE_FILE = /\.(ts|tsx|js|mjs|cjs)$/;
const TEST_FILE = /\.spec\.tsx?$/;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const IMPORT =
  /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const WORKER = /new\s+Worker\(\s*(?:path\.(?:join|resolve)\(\s*__dirname\s*,\s*)?['"]([^'"]+)['"]/g;
const TEST_CASE = /^\s*(?:it|test)(?:\.each\([^)]*\))?\s*\(/gm;

const walk = (dir) => walkFiles(dir, (file) => SOURCE_FILE.test(file) && !file.endsWith('.d.ts'));

function resolveFile(base) {
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => join(base, `index${ext}`))];
  if (base.endsWith('.js')) candidates.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
}

function exportTarget(exportsField, subpath) {
  if (typeof exportsField === 'string') return subpath === '.' ? exportsField : null;
  let target = exportsField[subpath];
  if (!target) {
    for (const [pattern, value] of Object.entries(exportsField)) {
      if (!pattern.includes('*')) continue;
      const [prefix, suffix] = pattern.split('*');
      if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
      const star = subpath.slice(prefix.length, subpath.length - suffix.length);
      const condition = typeof value === 'string' ? value : value.types || value.require || value.default;
      target = condition.replace(/\*/g, star);
    }
  }
  return target && typeof target === 'object' ? target.types || target.require || target.default : target;
}

/** Maps `@trading-model/<pkg>[/sub]` to the package's source file. */
function resolvePackage(specifier) {
  const match = specifier.match(/^@trading-model\/([^/]+)(?:\/(.*))?$/);
  const dir = match && join(ROOT, 'packages', match[1]);
  if (!dir || !existsSync(dir)) return null;
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const subpath = match[2] ? `./${match[2]}` : '.';
  const target =
    (manifest.exports && exportTarget(manifest.exports, subpath)) ||
    (subpath === '.' ? manifest.main || './src/index.ts' : `./src/${match[2]}`);
  const source = target.replace(/^\.\/dist\//, './src/').replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts');
  return resolveFile(join(dir, source)) || resolveFile(join(dir, 'src', match[2] || 'index'));
}

const edgesCache = new Map();
function edges(file) {
  if (edgesCache.has(file)) return edgesCache.get(file);
  const content = readFileSync(file, 'utf8');
  const targets = [];
  for (const match of content.matchAll(IMPORT)) {
    const specifier = match[1] || match[2] || match[3] || match[4];
    let target = null;
    if (specifier.startsWith('.')) target = resolveFile(resolve(dirname(file), specifier));
    else if (specifier.startsWith('@trading-model/')) target = resolvePackage(specifier);
    if (target) targets.push(normalize(target));
  }
  for (const [, path] of content.matchAll(WORKER)) {
    const target = resolveFile(resolve(dirname(file), path));
    if (target) targets.push(normalize(target));
  }
  edgesCache.set(file, targets);
  return targets;
}

function entryPoints(dir) {
  const entries = [];
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const bins = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {});
  for (const target of [manifest.main, ...bins].filter(Boolean)) {
    const source = target.replace(/^\.?\/?dist\//, 'src/').replace(/\.js$/, '.ts');
    entries.push(resolveFile(join(dir, source)));
  }
  const html = join(dir, 'index.html');
  if (existsSync(html)) {
    const script = readFileSync(html, 'utf8').match(/<script[^>]+src="\/([^"]+)"/);
    if (script) entries.push(resolveFile(join(dir, script[1])));
  }
  return entries.filter(Boolean).map(normalize);
}

function reachableFiles(services) {
  const reached = new Set();
  for (const dir of services) {
    const stack = entryPoints(dir);
    if (stack.length === 0) console.warn(`No entry point found for ${relative(ROOT, dir)}`);
    while (stack.length) {
      const file = stack.pop();
      if (reached.has(file)) continue;
      reached.add(file);
      stack.push(...edges(file));
    }
  }
  return reached;
}

function lineCount(file) {
  return readFileSync(file, 'utf8').split('\n').length;
}

/** Specs whose src imports are all unreachable: green, but guarding nothing that runs. */
function phantomSpecs(dir, reached) {
  const specs = [];
  for (const spec of walk(dir).filter((file) => TEST_FILE.test(file) && !file.includes(`${sep}e2e${sep}`))) {
    const subjects = edges(spec).filter((file) => file.includes(`${sep}src${sep}`) && !TEST_FILE.test(file));
    if (subjects.length > 0 && subjects.every((file) => !reached.has(file))) {
      specs.push([relative(ROOT, spec), (readFileSync(spec, 'utf8').match(TEST_CASE) || []).length]);
    }
  }
  return specs;
}

const workspaceDirs = (group) => readdirSync(join(ROOT, group)).map((entry) => join(ROOT, group, entry));
const services = workspaceDirs('services');
const reached = reachableFiles(services);

const rows = [];
for (const dir of [...services, ...workspaceDirs('packages')]) {
  const sources = walk(join(dir, 'src')).filter((file) => !TEST_FILE.test(file)).map(normalize);
  const unreachable = sources.filter((file) => !reached.has(file)).map((file) => [relative(ROOT, file), lineCount(file)]);
  const phantoms = phantomSpecs(dir, reached);
  const lines = sources.reduce((sum, file) => sum + lineCount(file), 0);
  const deadLines = unreachable.reduce((sum, [, count]) => sum + count, 0);
  rows.push({
    workspace: basename(dir),
    srcLines: lines,
    unreachableLines: deadLines,
    unreachablePct: lines ? Math.round((deadLines / lines) * 100) : 0,
    phantomTests: phantoms.reduce((sum, [, count]) => sum + count, 0),
  });
  if (LIST && unreachable.length) {
    console.log(`\n${basename(dir)}: unreachable src`);
    for (const [file, count] of unreachable.sort((a, b) => b[1] - a[1])) console.log(`  ${count}\t${file}`);
  }
  if (LIST && phantoms.length) {
    console.log(`${basename(dir)}: specs exercising only unreachable src`);
    for (const [file, count] of phantoms) console.log(`  ${count}\t${file}`);
  }
}

console.table(rows);
const total = rows.reduce((sum, row) => sum + row.srcLines, 0);
const dead = rows.reduce((sum, row) => sum + row.unreachableLines, 0);
const phantomTests = rows.reduce((sum, row) => sum + row.phantomTests, 0);
console.log(`Unreachable: ${dead}/${total} src lines (${Math.round((dead / total) * 100)}%)`);

if (MAX_LINES !== null) {
  const failures = [];
  if (dead > MAX_LINES) failures.push(`${dead} unreachable src lines, threshold ${MAX_LINES}`);
  if (phantomTests > 0) failures.push(`${phantomTests} tests only exercise unreachable src`);
  if (failures.length) {
    console.error(`
reach:check failed: ${failures.join('; ')}.`);
    console.error('Wire the code to an entry point (main, bin, route, job) or remove it; --list shows the files.');
    process.exit(1);
  }
  console.log(`reach:check ok (threshold ${MAX_LINES} lines).`);
}
