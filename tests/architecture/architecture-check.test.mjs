import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { analyze, compare } from '../../scripts/architecture-check.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'arch-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const S = 'services/svc/src';
const none = { cycles: [], layers: [] };

test('runtime cycle is a new finding, a type-only cycle is not', () => {
  const root = fixture({
    [`${S}/a.ts`]: "import { b } from './b';\nexport const a = b;",
    [`${S}/b.ts`]: "import { a } from './a';\nexport const b = a;",
    [`${S}/t1.ts`]: "import type { T2 } from './t2';\nexport type T1 = T2;",
    [`${S}/t2.ts`]: "import { type T1 } from './t1';\nexport type T2 = T1;",
  });
  try {
    const found = analyze(root);
    assert.deepEqual(found.cycles, [`${S}/a.ts | ${S}/b.ts`]);
    assert.equal(compare(found, none).length, 1);
    assert.deepEqual(compare(found, found), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('application importing adapters or infrastructure fails, startup files are exempt', () => {
  const root = fixture({
    [`${S}/adapters/db.ts`]: 'export const db = 1;',
    [`${S}/application/use-case.ts`]: "import { db } from '../adapters/db';\nexport const u = db;",
    [`${S}/application/server.ts`]: "import { db } from '../adapters/db';\nexport const s = db;",
    [`${S}/application/shared.ts`]: "import type { X } from '@trading-model/http/infrastructure/logger';\nexport type Y = X;",
  });
  try {
    const found = analyze(root);
    assert.deepEqual(found.layers, [
      `${S}/application/shared.ts -> @trading-model/http/infrastructure/logger`,
      `${S}/application/use-case.ts -> ../adapters/db`,
    ]);
    assert.equal(compare(found, none).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixed baseline entry is reported as stale (ratchet)', () => {
  assert.deepEqual(compare(none, { cycles: ['x | y'], layers: [] }), ['stale baseline cycles entry (fixed, remove it): x | y']);
});
