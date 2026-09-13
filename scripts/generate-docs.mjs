/**
 * Generates HTML documentation using TypeDoc for all packages and services.
 *
 * Usage:
 *   bun scripts/generate-docs.mjs               # full HTML generation
 *   bun scripts/generate-docs.mjs --dry-run      # count files only
 *
 * Output: docs/architecture/code/
 * Each module gets its own subdirectory with TypeDoc HTML output.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));
const OUT_DIR = join(ROOT, 'docs', 'architecture', 'code');
const DRY_RUN = process.argv.includes('--dry-run');

/** Shared stylesheet injected into every TypeDoc output via --customCss. */
const CUSTOM_CSS = join(ROOT, 'scripts', 'docs', 'typedoc-custom.css');

/**
 * TypeDoc entry per module: label, type, entry points, strategy, description.
 *
 * type: 'package' | 'service'
 * strategy: 'expand' documents a whole src/ tree (modules without a single
 *            barrel entry), 'resolve' follows a specific entry file.
 */
const MODULES = [
  {
    label: '@trading-model/common',
    type: 'package',
    description: "Package d'infrastructure partagée — primitives, contrats, reliability, persistence, utils, ws",
    entryPoints: [join(ROOT, 'packages/common/src')],
    strategy: 'expand',
    tsconfig: join(ROOT, 'packages/common/tsconfig.json'),
  },
  {
    label: '@trading-model/http',
    type: 'package',
    description: 'Plateforme HTTP — middleware, http client, logging',
    entryPoints: [join(ROOT, 'packages/http/src')],
    strategy: 'expand',
    tsconfig: join(ROOT, 'packages/http/tsconfig.json'),
  },
  {
    label: '@trading-model/jobs',
    type: 'package',
    description: 'Protocole worker distribué et récupération des jobs orphelins',
    entryPoints: [join(ROOT, 'packages/jobs/src')],
    strategy: 'expand',
    tsconfig: join(ROOT, 'packages/jobs/tsconfig.json'),
  },
  {
    label: '@trading-model/address-manager',
    type: 'package',
    description: 'Gestionnaire d\'adresses et découverte de services',
    entryPoints: [join(ROOT, 'packages/address-manager/src/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'packages/address-manager/tsconfig.json'),
  },
  {
    label: '@trading-model/broker-message',
    type: 'package',
    description: 'Bus de messages — publication, souscription, routage',
    entryPoints: [join(ROOT, 'packages/broker-message/src/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'packages/broker-message/tsconfig.json'),
  },
  {
    label: '@trading-model/validation',
    type: 'package',
    description: 'Validations et schémas partagés — DTOs admin, contrats, primitives',
    entryPoints: [join(ROOT, 'packages/validation/src')],
    strategy: 'expand',
    tsconfig: join(ROOT, 'packages/validation/tsconfig.json'),
  },
  {
    label: '@trading-model/server-utils',
    type: 'package',
    description: 'Utilitaires serveur — bootstrap, démarrage/arrêt, TLS, télémétrie',
    entryPoints: [join(ROOT, 'packages/server-utils/src')],
    strategy: 'expand',
    tsconfig: join(ROOT, 'packages/server-utils/tsconfig.json'),
  },
  {
    label: '@trading-model/crypto',
    type: 'package',
    description: 'Primitives cryptographiques — HMAC, hachage, signatures, jetons, PRNG',
    entryPoints: [join(ROOT, 'packages/crypto/src')],
    strategy: 'expand',
    tsconfig: join(ROOT, 'packages/crypto/tsconfig.json'),
  },
  {
    label: 'api-gateway',
    type: 'service',
    description: 'Point d\'entrée externe unique — routage, authentification, rate limiting, proxy',
    entryPoints: [join(ROOT, 'services/api-gateway/src/application/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/api-gateway/tsconfig.json'),
  },
  {
    label: 'discovery-server',
    type: 'service',
    description: 'Service de découverte — registre d\'instances, heartbeat, tokens',
    entryPoints: [join(ROOT, 'services/discovery-server/src/application/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/discovery-server/tsconfig.json'),
  },
  {
    label: 'message-manager',
    type: 'service',
    description: 'Gestionnaire de messages — broker pub/sub, MongoDB',
    entryPoints: [join(ROOT, 'services/message-manager/src/application/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/message-manager/tsconfig.json'),
  },
  {
    label: 'financial-scraper',
    type: 'service',
    description: 'Récupérateur de données financières — Binance, MySQL',
    entryPoints: [join(ROOT, 'services/financial-scraper/src/application/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/financial-scraper/tsconfig.json'),
  },
  {
    label: 'audit-logger',
    type: 'service',
    description: 'Journal d\'audit immuable — événements, erreurs, MongoDB',
    entryPoints: [join(ROOT, 'services/audit-logger/src/application/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/audit-logger/tsconfig.json'),
  },
  {
    label: 'dlq-service',
    type: 'service',
    description: 'Gestion de la file des messages en échec — stockage, relecture',
    entryPoints: [join(ROOT, 'services/dlq-service/src/infrastructure/app/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/dlq-service/tsconfig.json'),
  },
  {
    label: 'trader-trainer',
    type: 'service',
    description: 'Entraîneur de trading — algorithme génétique, réseau de neurones',
    entryPoints: [join(ROOT, 'services/trader-trainer/src/infrastructure/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/trader-trainer/tsconfig.json'),
  },
  {
    label: 'admin-interface',
    type: 'service',
    description: 'Interface d\'administration React — audit, DLQ, market data, jobs, workers',
    entryPoints: [join(ROOT, 'services/admin-interface/src')],
    strategy: 'expand',
    tsconfig: join(ROOT, 'services/admin-interface/tsconfig.app.json'),
  },
];

function posix(p) {
  return p.replace(/\\/g, '/');
}

function buildTypedocArgs(mod) {
  const args = [
    'bunx typedoc',
    ...mod.entryPoints.map(ep => `"${posix(ep)}"`),
    `--out "${posix(join(OUT_DIR, mod.label))}"`,
    `--tsconfig "${posix(mod.tsconfig)}"`,
    `--name "${mod.label}"`,
    `--customCss "${posix(CUSTOM_CSS)}"`,
    '--includeVersion',
    '--cleanOutputDir',
    '--hideGenerator',
    '--searchInComments',
    '--skipErrorChecking',
    '--validation.invalidLink false',
    '--validation.notExported false',
    '--validation.notDocumented false',
  ];

  if (mod.strategy === 'expand') {
    args.push('--entryPointStrategy Expand');
  } else {
    args.push('--entryPointStrategy Resolve');
  }

  return args.join(' ');
}

if (DRY_RUN) {
  console.log('── Dry run: modules to document ──\n');
  for (const mod of MODULES) {
    console.log(`  ${mod.label}`);
    console.log(`    Type: ${mod.type}`);
    console.log(`    Entry: ${mod.entryPoints.join(', ')}`);
    console.log(`    Strategy: ${mod.strategy}`);
    console.log(`    Output: ${join(OUT_DIR, mod.label)}`);
    console.log('');
  }

  const total = MODULES.length;
  console.log(`Total: ${total} modules`);
  console.log(`Output: ${OUT_DIR}/`);
  process.exit(0);
}

// Ensure output directory
if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

console.log('── Generating TypeDoc documentation ──\n');

for (const mod of MODULES) {
  const cmd = buildTypedocArgs(mod);
  const outPath = join(OUT_DIR, mod.label);

  // Clear previous output for this module
  if (existsSync(outPath)) {
    rmSync(outPath, { recursive: true, force: true });
  }

  console.log(`  ${mod.label}...`);
  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 120000,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    console.log(`    ✓ ${outPath}`);
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    if (stderr.includes('Error')) {
      console.error(`    ✗ Failed: ${stderr.split('\n').slice(0, 5).join('\n      ')}`);
    } else {
      console.log(`    ✓ ${outPath} (with warnings)`);
      if (stderr)
        console.log(`      ${stderr.split('\n').filter(Boolean).slice(0, 3).join('\n      ')}`);
    }
  }
}

// Generate root index
const typeLabels = { package: 'Package', service: 'Service' };
const cards = MODULES.map(mod => {
  const href = `${mod.label}/index.html`;
  return `      <div class="card">
        <h2><a href="${href}">${mod.label}</a></h2>
        <div class="desc">${mod.description}</div>
        <div class="type">${typeLabels[mod.type]}</div>
      </div>`;
});
const cardsByType = type =>
  cards.filter(card => card.includes(`>${typeLabels[type]}<`)).join('\n');

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>trading-model — Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Inter, sans-serif; background: #080c15; color: #e2e8f0; line-height: 1.6; min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #ffffff; }
    p.subtitle { color: #94a3b8; margin-bottom: 2rem; font-size: 1.1rem; }
    .section-title { color: #ffffff; font-size: 1.25rem; margin: 1.5rem 0 0.75rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .card { background: #111827; border: 1px solid #243046; border-radius: 12px; padding: 1.25rem; transition: transform 0.15s, border-color 0.15s, background 0.15s; }
    .card:hover { transform: translateY(-2px); background: #1e293b; border-color: rgba(129, 140, 248, 0.5); }
    .card h2 { font-size: 1.1rem; margin-bottom: 0.3rem; font-family: 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace; }
    .card h2 a { color: #818cf8; text-decoration: none; }
    .card h2 a:hover { text-decoration: underline; }
    .card .desc { font-size: 0.85rem; color: #94a3b8; }
    .card .type { display: inline-block; font-size: 0.7rem; font-family: 'JetBrains Mono', Menlo, Consolas, monospace; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.15rem 0.5rem; border-radius: 4px; background: rgba(129, 140, 248, 0.1); color: #818cf8; border: 1px solid rgba(129, 140, 248, 0.25); margin-top: 0.5rem; }
    hr { border: none; border-top: 1px solid #243046; margin: 1.5rem 0; }
    .tm-doc-header { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem 1rem; padding: 0.625rem 1rem; background: rgba(11, 15, 25, 0.88); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid #243046; font-size: 0.8125rem; font-family: 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace; }
    .tm-doc-header a { color: #cbd5e1; text-decoration: none; font-weight: 600; }
    .tm-doc-header a:hover { color: #fff; }
    .tm-doc-brand { color: #818cf8 !important; font-size: 0.9375rem; }
    .tm-doc-module, .tm-doc-page { color: #94a3b8; }
    .tm-doc-module::before { content: '‹'; color: #475569; margin-right: 1rem; }
    .tm-doc-page::before { content: '·'; color: #475569; margin-right: 1rem; }
    .tm-doc-back { margin-left: auto; color: #94a3b8 !important; font-size: 0.75rem; }
    footer { margin-top: 2rem; }
    .tm-doc-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem 1rem; max-width: 900px; margin: 0 auto; padding: 1.25rem 2rem 1.5rem; color: #94a3b8; font-size: 0.75rem; font-family: 'JetBrains Mono', Menlo, Consolas, monospace; border-top: 1px solid rgba(36, 48, 70, 0.6); }
    .tm-doc-footer a { color: #818cf8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>trading-model</h1>
    <p class="subtitle">Documentation générée par TypeDoc — ${new Date().toISOString().split('T')[0]}</p>

    <h2 class="section-title">Packages</h2>
    <div class="grid">
${cardsByType('package')}
    </div>

    <h2 class="section-title">Services</h2>
    <div class="grid">
${cardsByType('service')}
    </div>

    <hr>

    <h2>Liens utiles</h2>
    <ul style="margin-top:0.5rem; color:#8b8fa3;">
      <li><a href="https://github.com/docteur-turboss/trading-model" style="color:#7c9cf0;">GitHub</a></li>
      <li><a href="../../../docs/getting-started/quickstart.md" style="color:#7c9cf0;">Quickstart</a></li>
      <li><a href="../../../docs/standards/architecture-standards.md" style="color:#7c9cf0;">Architecture standards</a></li>
    </ul>

    <footer>Generated using <a href="https://typedoc.org/">TypeDoc</a></footer>
  </div>
</body>
</html>`;

const indexPath = join(OUT_DIR, 'index.html');
const { writeFileSync } = await import('node:fs');
writeFileSync(indexPath, indexHtml, 'utf-8');
console.log(`\n✓ Root index: ${indexPath}`);

// Apply the shared structural chrome (header/footer) to every generated page.
const { postprocess } = await import('./docs/postprocess.mjs');
const { pages, icons } = postprocess(OUT_DIR);
console.log(`✓ Post-processed ${pages} pages, restyled ${icons} icon sets`);

console.log('Done.');
