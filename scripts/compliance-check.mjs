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
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
const journalH = grab('services/message-manager/src/application/ports/message-journal-port.ts', /JOURNAL_RETENTION_MS = (\d+) \* 60 \* 60 \* 1000/)[1];
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
  [REGISTER, `${mysqlDays} days (5 years`],
  [DPIA, `${auditDays} days audit, ${dlqDays} days DLQ`],
  [DPIA, `${keyPatterns} sensitive-key patterns`],
  ['docs/compliance/information-security-policy.md', `${keyPatterns} patterns`],
];

const FORBIDDEN = /not bounded|pino|in-memory dispatch|triple-layer|quadruple-layer/i;

const errors = [];
for (const [file, text] of CHECKS) {
  if (!read(file).includes(text)) errors.push(`${file}: missing "${text}"`);
}
for (const f of ['data-processing-register', 'dpia', 'compliance-framework', 'information-security-policy']) {
  const file = `docs/compliance/${f}.md`;
  read(file).split('\n').forEach((l, i) => {
    if (FORBIDDEN.test(l)) errors.push(`${file}:${i + 1}: stale wording "${l.match(FORBIDDEN)[0]}"`);
  });
}

if (errors.length) {
  console.error(`compliance:check failed\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`compliance:check ok (${CHECKS.length} values)`);
