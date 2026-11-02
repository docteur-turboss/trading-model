/**
 * Builds a Jest `moduleNameMapper` that resolves `@trading-model/*` imports to
 * the packages' TypeScript sources, restricted to what the workspace manifest
 * allows: its own package, its declared dependencies/devDependencies, and the
 * runtime dependencies those pull in transitively (needed to load their src).
 *
 * A test importing an undeclared internal package therefore fails to resolve
 * instead of silently working. `scripts/check-deps.mjs` enforces the stricter
 * "direct import must be declared" rule.
 */
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const SCOPE = '@trading-model/';
const PACKAGES_DIR = join(__dirname, '..', 'packages');

function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

function internalNames(record = {}) {
  return Object.keys(record).filter((name) => name.startsWith(SCOPE));
}

function packageDir(name) {
  return join(PACKAGES_DIR, name.slice(SCOPE.length));
}

function resolvablePackages(workspaceDir) {
  const manifest = readManifest(workspaceDir);
  const pending = [
    ...internalNames(manifest.dependencies),
    ...internalNames(manifest.devDependencies),
  ];
  if (manifest.name.startsWith(SCOPE)) pending.push(manifest.name);

  const seen = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    pending.push(...internalNames(readManifest(packageDir(name)).dependencies));
  }
  return [...seen].sort();
}

function workspaceModuleNameMapper(workspaceDir) {
  const mapper = {};
  for (const name of resolvablePackages(workspaceDir)) {
    const src = join(packageDir(name), 'src').replaceAll('\\', '/');
    mapper[`^${name}/(.*)$`] = `${src}/$1`;
    if (existsSync(join(src, 'index.ts'))) mapper[`^${name}$`] = `${src}/index.ts`;
  }
  return mapper;
}

module.exports = { workspaceModuleNameMapper };
