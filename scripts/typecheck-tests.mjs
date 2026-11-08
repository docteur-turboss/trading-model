/**
 * Type-checks the test files of every workspace (no emit): `tsc -p
 * tsconfig.test.json`, which extends the workspace `tsconfig.json` and adds
 * `tests/**` to the files of `src/**`. ts-jest runs with `diagnostics: false`
 * (speed), so this is the only place a spec calling `src` with a stale
 * signature, or a mock that kept an old shape, fails.
 *
 * Stops at the first workspace with errors. Needs the packages built
 * (`bun run build`): `@trading-model/*` resolve to their `dist`.
 *
 * Usage: node scripts/typecheck-tests.mjs
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Workspaces whose specs still carry type errors, with the count at the time
 * of exclusion. Remove an entry once its specs pass; never add one
 * (dlq-service and trader-trainer must never be listed).
 */
const EXCLUDED = new Map([
  // Specs built on a stale model: `ip` instead of `host` on ServiceInstance, service names that no
  // longer exist, registry calls typed sync | Promise. 43 errors left (2026-11-08).
  ['services/discovery-server', 43],
  // Specs call the broker with stale shapes: `serviceName` literals that are not ServiceId, `Date`
  // for UnixTimestamp, deprecated DeliveryMode keys. 68 errors left (2026-11-08).
  ['services/message-manager', 68],
]);

const workspaces = ['packages', 'services'].flatMap((group) =>
  readdirSync(join(ROOT, group))
    .map((name) => `${group}/${name}`)
    .filter((dir) => existsSync(join(ROOT, dir, 'package.json'))),
);

const missing = workspaces.filter((dir) => !existsSync(join(ROOT, dir, 'tsconfig.test.json')));
if (missing.length > 0) {
  console.error(`tsconfig.test.json missing in: ${missing.join(', ')}`);
  process.exit(1);
}

for (const dir of workspaces) {
  if (EXCLUDED.has(dir)) {
    console.log(`skip  ${dir} (${EXCLUDED.get(dir)} known errors, see EXCLUDED)`);
    continue;
  }
  const tsc = createRequire(join(ROOT, dir, 'package.json')).resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.test.json'], {
    cwd: join(ROOT, dir),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`typecheck:tests failed in ${dir}`);
    process.exit(result.status ?? 1);
  }
  console.log(`ok    ${dir}`);
}
