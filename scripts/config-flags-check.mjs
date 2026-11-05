/**
 * Finds configuration that no deployment can turn on (ADR-0013).
 *
 * Import reachability (`reach:check`) sees a module as live as soon as
 * something imports it, even when the code behind it only runs if a variable
 * is set. ADR-0013 found such a case: a WebSocket client behind `WS_URL`,
 * which no deployment defined, so the client never started.
 *
 * This check lists every environment variable the services and packages read
 * (keys of the Zod env schemas, `process.env.X`) and looks for each name in
 * the deployment profiles: `.env.example`, `docker-compose.yml`, `deploy/`,
 * the Dockerfiles and the deploy workflow. A variable read by the code is
 * classified as:
 *   - required: no default; the service refuses to start without it
 *   - default:  has a default, so its code path runs either way
 *   - optional: no default; absent means "off" (the ADR-0013 case)
 *   - off:      a switch whose default is false; absent means "off" too
 *
 * Fails when an optional or off variable is defined in no profile (code that no
 * deployment turns on), when a required one is defined nowhere (a service
 * that cannot start), or when code reads `env.X` / `ENV.X` for a variable no
 * schema declares: Zod drops unknown keys, so it is always undefined, whatever
 * a deployment sets. Exceptions live in ALLOWED_UNSET, each with its reason.
 * Also fails when a variable the code reads has no table row in
 * `docs/deployment/ENV.md` (a line starting with `| \`NAME\` |`), so that
 * reference stays exhaustive. A mention in prose or in another row's
 * description does not count.
 * A variable that profiles set but no code reads is reported as a warning.
 *
 * Usage: node scripts/config-flags-check.mjs [--list]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build']);

/**
 * Optional variables that no profile sets on purpose. Each entry says why the
 * code behind it is still meant to exist; "nobody needs it yet" is not a reason.
 */
const ALLOWED_UNSET = {};

/** Profiles: what a real deployment can set. Tests and docs are not profiles. */
const PROFILE_ROOTS = ['.env.example', 'docker-compose.yml', 'deploy', '.github/workflows/deploy.yml'];
const PROFILE_FILE = /(\.ya?ml|\.conf|\.hcl|\.sh|\.env\.example|\.properties|Dockerfile|\.json)$/;

const ENV_KEY = /^\s*([A-Z][A-Z0-9_]{2,}):\s*(z\b|[A-Za-z]+Schema\b)/;
const PARSED_ENV_READ = /\b(?:env|ENV)\.([A-Z][A-Z0-9_]{2,})\b/g;
const PROCESS_ENV = /process\.env(?:\.([A-Z][A-Z0-9_]+)|\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\])/g;

function walk(path, accept, files = []) {
  if (!existsSync(path)) return files;
  if (statSync(path).isFile()) {
    if (accept(path)) files.push(path);
    return files;
  }
  for (const entry of readdirSync(path)) {
    if (!SKIP_DIRS.has(entry)) walk(join(path, entry), accept, files);
  }
  return files;
}

const workspaces = ['services', 'packages'].flatMap((group) =>
  readdirSync(join(ROOT, group)).map((entry) => join(ROOT, group, entry)),
);
const sourceFiles = workspaces.flatMap((dir) =>
  walk(join(dir, 'src'), (file) => /\.tsx?$/.test(file) && !/\.(spec|d)\.ts$/.test(file)),
);

/** name -> { kinds, sources }: variables a schema or `process.env` reads. */
const read = new Map();
/** name -> files reading it from a parsed env object (`env.X`, `ENV.X`). */
const parsedReads = new Map();
function record(name, kind, file) {
  const entry = read.get(name) ?? { kinds: new Set(), sources: new Set() };
  entry.kinds.add(kind);
  entry.sources.add(relative(ROOT, file).replaceAll('\\', '/'));
  read.set(name, entry);
}

for (const file of sourceFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const key = ENV_KEY.exec(lines[i]);
    if (key) {
      // The schema of a key runs until the next key or the end of the object.
      let schema = lines[i];
      for (let j = i + 1; j < lines.length && !ENV_KEY.test(lines[j]) && !/^\s*}/.test(lines[j]); j++) {
        schema += lines[j];
      }
      const kind = /\.default\(\s*["']?false["']?\s*\)/.test(schema)
        ? 'off'
        : /\.default\(|\.catch\(/.test(schema)
          ? 'default'
          : /\.optional\(\)/.test(schema)
            ? 'optional'
            : 'required';
      record(key[1], kind, file);
    }
    for (const [, name] of lines[i].matchAll(PARSED_ENV_READ)) {
      const files = parsedReads.get(name) ?? new Set();
      files.add(relative(ROOT, file).replaceAll('\\', '/'));
      parsedReads.set(name, files);
    }
    for (const match of lines[i].matchAll(PROCESS_ENV)) {
      const rest = lines[i].slice(match.index + match[0].length);
      record(match[1] || match[2], /^\s*(\?\?|\|\|)/.test(rest) ? 'default' : 'optional', file);
    }
  }
}

const profileFiles = PROFILE_ROOTS.flatMap((path) =>
  walk(join(ROOT, path), (file) => PROFILE_FILE.test(file) || file.endsWith('.env.example')),
);
const profileText = profileFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const definedIn = (name) => new RegExp(`(^|[^A-Z0-9_])${name}([^A-Z0-9_]|$)`, 'm').test(profileText);
/**
 * A switch counts as set only when a profile turns it on: `X: "true"`,
 * `X=1`, `X: ${X:-true}`, a K8s `- name: X` / `value: "true"` pair, or a
 * kustomize patch `path: /data/X` / `value: "true"`.
 */
const switchedOnIn = (name) =>
  new RegExp(`(^|[^A-Z0-9_])${name}["']?\\s*[:=]\\s*(\\$\\{${name}:-)?["']?(true|1)\\b`, 'm').test(profileText) ||
  new RegExp(`(name:\\s*["']?|path:\\s*/data/)${name}["']?\\s*\\n\\s*value:\\s*["']?(true|1)\\b`, 'm').test(profileText);

/** The weakest guarantee wins: a variable optional anywhere can be left unset. */
function kindOf(entry) {
  if (entry.kinds.has('off')) return 'off';
  if (entry.kinds.has('optional')) return 'optional';
  if (entry.kinds.has('required')) return 'required';
  return 'default';
}

const envDoc = readFileSync(join(ROOT, 'docs/deployment/ENV.md'), 'utf8');
// Names are [A-Z0-9_] only: no regex escaping needed.
const documented = (name) => new RegExp(`^\\|\\s*\`${name}\`\\s*\\|`, 'm').test(envDoc);

const errors = [];
const rows = [];
for (const [name, entry] of [...read].sort(([a], [b]) => a.localeCompare(b))) {
  const kind = kindOf(entry);
  const defined = kind === 'off' ? switchedOnIn(name) : definedIn(name);
  rows.push({ variable: name, kind, defined, documented: documented(name) });
  if (!documented(name)) {
    errors.push(`${name}: read by the code but has no row in docs/deployment/ENV.md (${[...entry.sources].join(', ')})`);
  }
  if (defined) continue;
  if ((kind === 'optional' || kind === 'off') && !ALLOWED_UNSET[name]) {
    errors.push(`${name}: ${kind}, set by no deployment profile — the code it turns on never runs (${[...entry.sources].join(', ')})`);
  }
  if (kind === 'required') {
    errors.push(`${name}: required, set by no deployment profile — the service cannot start (${[...entry.sources].join(', ')})`);
  }
}
for (const [name, files] of [...parsedReads].sort(([a], [b]) => a.localeCompare(b))) {
  if (!read.has(name)) {
    errors.push(`${name}: read from a parsed env but declared by no schema — always undefined (${[...files].join(', ')})`);
  }
}
for (const name of Object.keys(ALLOWED_UNSET)) {
  if (!read.has(name)) errors.push(`${name}: in ALLOWED_UNSET but no code reads it`);
  else if (definedIn(name)) errors.push(`${name}: in ALLOWED_UNSET but a profile sets it; drop the exception`);
}

if (LIST) console.table(rows);
if (errors.length) {
  console.error(`config-flags check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    'Set the variable in a profile, remove the code it gates, or add it to ALLOWED_UNSET with a reason; document every variable in docs/deployment/ENV.md.',
  );
  process.exit(1);
}
const counts = rows.reduce((acc, row) => ({ ...acc, [row.kind]: (acc[row.kind] ?? 0) + 1 }), {});
console.log(
  `config-flags OK: ${rows.length} variables read (${counts.required ?? 0} required, ${counts.default ?? 0} with default, ${counts.optional ?? 0} optional, ${counts.off ?? 0} off by default), ${profileFiles.length} profile files`,
);
