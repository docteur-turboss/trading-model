/**
 * Fails when the durations and counts cited in docs/compliance/ differ from
 * the code or deployment config they describe (issue #731).
 *
 * Each row of CHECKS reads a value from the code (`read`), builds the text the
 * register must contain (`expect`) and looks for it in a document. Also fails
 * on stale wording the audit found (`FORBIDDEN`).
 *
 * Usage: node scripts/compliance-check.mjs [rootDir]
 * `rootDir` (default: the repo) lets the test point at a fake tree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const grab = (p, re) => {
  const m = read(p).match(re);
  if (!m) throw new Error(`${p}: ${re} not found`);
  return m;
};

const REGISTER = 'docs/compliance/data-processing-register.md';
const DPIA = 'docs/compliance/dpia.md';

const auditDays = grab('services/audit-logger/src/infrastructure/config/env.ts', /AUDIT_RETENTION_DAYS: .*?\.default\((\d+)\)/)[1];
const dlqDays = grab('services/dlq-service/src/config/index-manager.ts', /expireAfterSeconds: (\d+) \* 86400/)[1];
const lokiHours = grab('observability/loki-config.yml', /retention_period: (\d+h)/)[1];
const promDays = [
  grab('docker-compose.yml', /--storage\.tsdb\.retention\.time=(\d+)d/)[1],
  grab('deploy/k8s/infra/prometheus.yaml', /--storage\.tsdb\.retention\.time=(\d+)d/)[1],
].reduce((a, b) => {
  if (a !== b) throw new Error(`Prometheus retention differs: compose ${a}d, k8s ${b}d`);
  return a;
});
const lokiDays = parseInt(lokiHours, 10) / 24;
const POLICY = 'docs/compliance/information-security-policy.md';
const journalH = grab('services/message-manager/src/domain/ports/message-journal.port.ts', /JOURNAL_RETENTION_MS = (\d+) \* 60 \* 60 \* 1000/)[1];
const mysqlDays = grab('scripts/retention-mysql.sh', /RETENTION_DAYS="\$\{RETENTION_DAYS:-(\d+)\}"/)[1];
const keyPatterns = grab('packages/http/src/infrastructure/sensitive-data-sanitizer.ts', /SENSITIVE_KEY_PATTERNS = \[([\s\S]*?)\n\];/)[1]
  .split('\n')
  .filter((l) => l.trim().startsWith('/')).length;

// [file, text it must contain]
const CHECKS = [
  [REGISTER, `${auditDays} days (5 years): \`AUDIT_RETENTION_DAYS\``],
  [REGISTER, `DLQ: ${dlqDays} days`],
  [REGISTER, `\`retention_period: ${lokiHours}\``],
  [REGISTER, `journaled ${journalH} h in Redis Streams`],
  ["docs/compliance/data-retention-policy.md", `Until delivered, ${journalH} h at most`],
  [REGISTER, `${mysqlDays} days (5 years`],
  [DPIA, `${auditDays} days audit, ${dlqDays} days DLQ`],
  [DPIA, `${keyPatterns} sensitive-key patterns`],
  [DPIA, `Loki ${lokiDays} days, Prometheus ${promDays} days`],
  [POLICY, `${lokiDays} days (\`${lokiHours}\`)`],
  [POLICY, `Prometheus → Grafana | ${promDays} days`],
  [POLICY, `${keyPatterns} patterns`],
];

// Last three: database TLS that does not exist (ADR-0060).
const TLS_CLAIMS = 'mTLS everywhere|[|] TLS connection [|]|All inter-service communication';
const FORBIDDEN = new RegExp(`message-manager memory|not bounded|pino|in-memory dispatch|triple-layer|quadruple-layer|${TLS_CLAIMS}`, 'i');
// The README is prose: only the database TLS claims apply to it.
const README_FORBIDDEN = new RegExp('mTLS everywhere|[|] TLS connection [|]', 'i');

const errors = [];
for (const [file, text] of CHECKS) {
  if (!read(file).includes(text)) errors.push(`${file}: missing "${text}"`);
}
const SCANNED = [['README.md', README_FORBIDDEN], ...['data-processing-register', 'dpia', 'compliance-framework', 'information-security-policy', 'access-control-policy', 'data-retention-policy', 'business-continuity-policy'].map((f) => [`docs/compliance/${f}.md`, FORBIDDEN])];
for (const [file, re] of SCANNED) {
  read(file).split('\n').forEach((l, i) => {
    if (re.test(l)) errors.push(`${file}:${i + 1}: stale wording "${l.match(re)[0]}"`);
  });
}

// Code identifiers cited in docs/compliance/ must exist in the code (issue #733).
// shortcut: whole-tree substring search, so a name used only in a comment still passes; upgrade if that bites.
const CODE_DIRS = ['services', 'packages', 'deploy', 'scripts', 'observability', 'tests', '.github'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
// Identifiers allowed without a match in code. Each needs a reason.
const IDENTIFIER_EXCEPTIONS = new Set([
  // none yet
]);
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.isDirectory()) walk(join(dir, e.name));
    else files.push(join(dir, e.name));
  }
};
for (const d of CODE_DIRS) {
  try {
    walk(d);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
const corpus = files.map((f) => read(f)).join('\n');
const baseNames = new Set(files.map((f) => basename(f)));
const IDENT = /^(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[a-z]+(?:[A-Z][a-z0-9]*)+)$/;
for (const doc of readdirSync(join(ROOT, 'docs/compliance')).filter((f) => f.endsWith('.md'))) {
  const file = `docs/compliance/${doc}`;
  read(file).split('\n').forEach((line, i) => {
    for (const [, span] of line.matchAll(/`([^`\s]+)`/g)) {
      if (IDENTIFIER_EXCEPTIONS.has(span)) continue;
      const found = span.endsWith('.ts') ? baseNames.has(basename(span)) : !IDENT.test(span) || corpus.includes(span);
      if (!found) errors.push(`${file}:${i + 1}: \`${span}\` not found in ${CODE_DIRS.join(', ')}`);
    }
  });
}

if (errors.length) {
  console.error(`compliance:check failed\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`compliance:check ok (${CHECKS.length} values)`);
