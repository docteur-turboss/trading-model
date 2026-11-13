/**
 * Ratcheted architecture gate (ADR-0015 §Enforcement, issue #673).
 *
 * Over `packages/*` and `services/*` `src` (specs excluded) it finds:
 *   - runtime import cycles: strongly connected components of the import
 *     graph; `import type` / `export type` and imports whose specifiers are
 *     all `type` are ignored (erased at build, no initialisation order);
 *   - layer violations: a file under `application/` importing `adapters/` or
 *     `infrastructure/` (relative path or `@trading-model/<pkg>/adapters|infrastructure/...`),
 *     type imports included. Startup files `application/{index,server,telemetry}.ts` are exempt.
 *
 * Existing findings live in `scripts/architecture-baseline.json`. The gate
 * fails on any finding absent from it AND on any baseline entry that no
 * longer exists (ratchet: the baseline only shrinks; remove the entry).
 * A cycle is identified by its sorted member files, so growing one counts as new.
 *
 * shortcut: dynamic import() / require() edges are ignored, add them if a cycle hides there.
 *
 * Usage: node scripts/architecture-check.mjs [--write]   (--write regenerates the baseline)
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_ROOTS, walk } from './lib/fs.mjs';
import ts from 'typescript';

const SCOPE = '@trading-model/';
const STARTUP = new Set(['index.ts', 'server.ts', 'telemetry.ts']);
const FORBIDDEN_LAYER = /(^|\/)(adapters|infrastructure)(\/|$)/;

const sourceFiles = (dir) => walk(dir, (file) => /\.tsx?$/.test(file) && !/\.(spec|test|d)\.tsx?$/.test(file));

function resolveFile(base) {
  const stem = base.replace(/\.(js|mjs)$/, '');
  for (const candidate of [`${stem}.ts`, `${stem}.tsx`, join(stem, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** @returns {{specifier: string, typeOnly: boolean}[]} */
function importsOf(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const found = [];
  for (const node of source.statements) {
    const isImport = ts.isImportDeclaration(node);
    if (!(isImport || ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
    const clause = isImport ? node.importClause?.namedBindings : node.exportClause;
    const elements = clause && 'elements' in clause ? clause.elements : [];
    const allInlineTypes = elements.length > 0 && elements.every((e) => e.isTypeOnly);
    const typeOnly = Boolean((isImport ? node.importClause?.isTypeOnly : node.isTypeOnly) || allInlineTypes);
    found.push({ specifier: node.moduleSpecifier.text, typeOnly });
  }
  return found;
}

/** Tarjan SCC; returns sorted components of 2+ nodes, or a self loop. */
function cycles(graph) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const result = [];
  const visit = (v) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v)) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1 || graph.get(v).has(v)) result.push(component.sort());
    }
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return result;
}

/**
 * Findings of a repository root: runtime cycles and layer violations.
 * @param {string} root
 * @returns {{cycles: string[], layers: string[]}} sorted, one string per finding
 */
export function analyze(root) {
  const rel = (p) => relative(root, p).split('\\').join('/');
  const files = [];
  for (const group of WORKSPACE_ROOTS) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) files.push(...sourceFiles(join(dir, name, 'src')));
  }
  const graph = new Map(files.map((f) => [rel(f), new Set()]));
  const layers = new Set();
  for (const file of files) {
    const from = rel(file);
    const inApplication = /\/src\/(.*\/)?application\//.test(from);
    const exempt = STARTUP.has(from.split('/').pop()) && /\/src\/application\/[^/]+$/.test(from);
    for (const { specifier, typeOnly } of importsOf(file)) {
      let target = null;
      let layerPath = specifier;
      if (specifier.startsWith('.')) {
        target = resolveFile(resolve(dirname(file), specifier));
        layerPath = target ? rel(target).replace(/^.*?\/src\//, '') : specifier;
      } else if (specifier.startsWith(SCOPE)) {
        const [pkg, ...sub] = specifier.slice(SCOPE.length).split('/');
        target = resolveFile(join(root, 'packages', pkg, 'src', ...(sub.length ? sub : ['index'])));
        layerPath = sub.join('/');
      }
      if (inApplication && !exempt && FORBIDDEN_LAYER.test(layerPath)) layers.add(`${from} -> ${specifier}`);
      if (target && !typeOnly && graph.has(rel(target))) graph.get(from).add(rel(target));
    }
  }
  return {
    cycles: cycles(graph)
      .map((c) => c.join(' | '))
      .sort(),
    layers: [...layers].sort(),
  };
}

/** Compares findings with the baseline; returns human-readable errors. */
export function compare(current, baseline) {
  const errors = [];
  for (const kind of ['cycles', 'layers']) {
    const known = new Set(baseline[kind] ?? []);
    const now = new Set(current[kind]);
    for (const entry of now) if (!known.has(entry)) errors.push(`new ${kind} finding: ${entry}`);
    for (const entry of known)
      if (!now.has(entry)) errors.push(`stale baseline ${kind} entry (fixed, remove it): ${entry}`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const baselinePath = join(root, 'scripts/architecture-baseline.json');
  const current = analyze(root);
  if (process.argv.includes('--write')) {
    writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`baseline written: ${current.cycles.length} cycles, ${current.layers.length} layer violations`);
  } else {
    const errors = compare(current, JSON.parse(readFileSync(baselinePath, 'utf8')));
    if (errors.length > 0) {
      console.error(errors.join('\n'));
      console.error(`\narchitecture:check failed (${errors.length}). Fix the code, never add to the baseline.`);
      process.exit(1);
    }
    console.log(
      `architecture:check ok (${current.cycles.length} cycles, ${current.layers.length} layer violations in baseline)`
    );
  }
}
