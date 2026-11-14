import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Directories holding the `src` trees every gate scans. */
export const WORKSPACE_ROOTS = ['packages', 'services'];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build', '.git']);

/**
 * Files under `path` (a directory, or a single file) that `accept(file)` keeps, in readdir order.
 * A missing path yields no file.
 * @param {string} path
 * @param {(file: string) => boolean} accept
 * @param {string[]} [files]
 * @returns {string[]}
 */
export function walk(path, accept, files = []) {
  if (!existsSync(path)) return files;
  if (!statSync(path).isDirectory()) {
    if (accept(path)) files.push(path);
    return files;
  }
  for (const entry of readdirSync(path)) {
    if (!SKIP_DIRS.has(entry)) walk(join(path, entry), accept, files);
  }
  return files;
}
