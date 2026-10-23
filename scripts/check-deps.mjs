/**
 * Verifies that every `@trading-model/*` import is backed by the importing
 * workspace's package.json, and that the declared package graph stays acyclic.
 *
 * Rules (each violation fails the check):
 *   - src imports must be listed in `dependencies`
 *   - test imports must be listed in `dependencies` or `devDependencies`
 *   - src must not import its own package by name (use a relative path)
 *   - every declared `@trading-model/*` dependency must actually be imported
 *   - `dependencies` between workspaces must not form a cycle
 *
 * Usage: node scripts/check-deps.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = '@trading-model/';
const WORKSPACE_DIRS = ['packages', 'services'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build']);
const SOURCE_FILE = /\.(ts|tsx|js|mjs|cjs)$/;
const TEST_FILE = /\.(spec|test)\.(ts|tsx)$/;
const IMPORT_SPECIFIER = /["'](@trading-model\/[a-z0-9-]+)(?:\/[^"']*)?["']/g;

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (SOURCE_FILE.test(entry) && !entry.endsWith('.d.ts')) files.push(path);
  }
  return files;
}

function internalNames(record = {}) {
  return Object.keys(record).filter((name) => name.startsWith(SCOPE));
}

function collectImports(files) {
  const imports = new Map();
  for (const file of files) {
    for (const [, name] of readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)) {
      if (!imports.has(name)) imports.set(name, file);
    }
  }
  return imports;
}

function loadWorkspaces() {
  const workspaces = [];
  for (const group of WORKSPACE_DIRS) {
    for (const entry of readdirSync(join(ROOT, group))) {
      const dir = join(ROOT, group, entry);
      const manifestPath = join(dir, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const all = walk(join(dir, 'src')).concat(walk(join(dir, 'tests')));
      const isTest = (file) => TEST_FILE.test(file) || relative(dir, file).startsWith('tests');
      workspaces.push({
        dir,
        name: manifest.name,
        deps: new Set(internalNames(manifest.dependencies)),
        devDeps: new Set(internalNames(manifest.devDependencies)),
        srcImports: collectImports(all.filter((file) => !isTest(file))),
        testImports: collectImports(all.filter(isTest)),
      });
    }
  }
  return workspaces;
}

function checkManifests(workspaces) {
  const errors = [];
  for (const ws of workspaces) {
    const where = (file) => relative(ROOT, file).replaceAll('\\', '/');
    for (const [name, file] of ws.srcImports) {
      if (name === ws.name) errors.push(`${ws.name}: src imports its own package by name (${where(file)})`);
      else if (!ws.deps.has(name)) errors.push(`${ws.name}: ${name} imported in src but not in dependencies (${where(file)})`);
    }
    for (const [name, file] of ws.testImports) {
      if (name !== ws.name && !ws.deps.has(name) && !ws.devDeps.has(name)) {
        errors.push(`${ws.name}: ${name} imported in tests but not declared (${where(file)})`);
      }
    }
    for (const name of ws.deps) {
      if (!ws.srcImports.has(name)) {
        errors.push(
          ws.testImports.has(name)
            ? `${ws.name}: ${name} only used by tests — move it to devDependencies`
            : `${ws.name}: ${name} declared in dependencies but never imported`,
        );
      }
    }
    for (const name of ws.devDeps) {
      if (!ws.testImports.has(name) && !ws.srcImports.has(name)) {
        errors.push(`${ws.name}: ${name} declared in devDependencies but never imported`);
      }
    }
  }
  return errors;
}

function checkCycles(workspaces) {
  const graph = new Map(workspaces.map((ws) => [ws.name, [...ws.deps]]));
  const state = new Map();
  const errors = [];
  const visit = (name, stack) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'active') {
      errors.push(`dependency cycle: ${[...stack.slice(stack.indexOf(name)), name].join(' -> ')}`);
      return;
    }
    state.set(name, 'active');
    for (const dep of graph.get(name) ?? []) visit(dep, [...stack, name]);
    state.set(name, 'done');
  };
  for (const name of graph.keys()) visit(name, []);
  return errors;
}

const workspaces = loadWorkspaces();
const errors = [...checkManifests(workspaces), ...checkCycles(workspaces)];
if (errors.length > 0) {
  console.error(`check-deps: ${errors.length} problem(s)\n`);
  for (const error of errors) console.error(`  ✖ ${error}`);
  process.exit(1);
}
console.log(`check-deps: ${workspaces.length} workspaces OK`);
