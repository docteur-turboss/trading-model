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

/** TypeDoc entry per module: label, entry points, strategy */
const MODULES = [
  {
    label: '@trading-model/common',
    entryPoints: [join(ROOT, 'packages/common/src')],
    strategy: 'expand',
    tsconfig: join(ROOT, 'packages/common/tsconfig.json'),
  },
  {
    label: '@trading-model/address-manager',
    entryPoints: [join(ROOT, 'packages/address-manager/src/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'packages/address-manager/tsconfig.json'),
  },
  {
    label: '@trading-model/broker-message',
    entryPoints: [join(ROOT, 'packages/broker-message/src/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'packages/broker-message/tsconfig.json'),
  },
  {
    label: 'discovery-server',
    entryPoints: [join(ROOT, 'services/discovery-server/src/application/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/discovery-server/tsconfig.json'),
  },
  {
    label: 'message-manager',
    entryPoints: [join(ROOT, 'services/message-manager/src/application/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/message-manager/tsconfig.json'),
  },
  {
    label: 'financial-scraper',
    entryPoints: [join(ROOT, 'services/financial-scraper/src/application/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/financial-scraper/tsconfig.json'),
  },
  {
    label: 'trader-trainer',
    entryPoints: [join(ROOT, 'services/trader-trainer/src/infrastructure/index.ts')],
    strategy: 'resolve',
    tsconfig: join(ROOT, 'services/trader-trainer/tsconfig.json'),
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
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>trading-model — Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: #1a1b2e; color: #e0e0e0; line-height: 1.6; min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #fff; }
    p.subtitle { color: #8b8fa3; margin-bottom: 2rem; font-size: 1.1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .card { background: #232540; border-radius: 8px; padding: 1.25rem; transition: transform 0.15s, background 0.15s; }
    .card:hover { transform: translateY(-2px); background: #2a2d4a; }
    .card h2 { font-size: 1.1rem; margin-bottom: 0.3rem; }
    .card h2 a { color: #7c9cf0; text-decoration: none; }
    .card h2 a:hover { text-decoration: underline; }
    .card .desc { font-size: 0.85rem; color: #8b8fa3; }
    .card .type { display: inline-block; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: #2d3a5c; color: #7c9cf0; margin-top: 0.5rem; }
    hr { border: none; border-top: 1px solid #2a2d4a; margin: 1.5rem 0; }
    footer { text-align: center; color: #555; font-size: 0.8rem; padding: 2rem 0; }
    footer a { color: #7c9cf0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>trading-model</h1>
    <p class="subtitle">Documentation générée par TypeDoc — ${new Date().toISOString().split('T')[0]}</p>

    <div class="grid">
      <div class="card">
        <h2><a href="@trading-model/common/index.html">@trading-model/common</a></h2>
        <div class="desc">Package d'infrastructure partagée — logger, serveur, middleware, validation, types, crypto</div>
        <div class="type">Package</div>
      </div>

      <div class="card">
        <h2><a href="@trading-model/address-manager/index.html">@trading-model/address-manager</a></h2>
        <div class="desc">Gestionnaire d'adresses et découverte de services</div>
        <div class="type">Package</div>
      </div>

      <div class="card">
        <h2><a href="@trading-model/broker-message/index.html">@trading-model/broker-message</a></h2>
        <div class="desc">Bus de messages — publication, souscription, routage</div>
        <div class="type">Package</div>
      </div>

      <div class="card">
        <h2><a href="discovery-server/index.html">discovery-server</a></h2>
        <div class="desc">Service de découverte — registre d'instances, heartbeat, tokens</div>
        <div class="type">Service</div>
      </div>

      <div class="card">
        <h2><a href="message-manager/index.html">message-manager</a></h2>
        <div class="desc">Gestionnaire de messages — broker pub/sub, MongoDB</div>
        <div class="type">Service</div>
      </div>

      <div class="card">
        <h2><a href="financial-scraper/index.html">financial-scraper</a></h2>
        <div class="desc">Récupérateur de données financières — Binance, MySQL</div>
        <div class="type">Service</div>
      </div>

      <div class="card">
        <h2><a href="trader-trainer/index.html">trader-trainer</a></h2>
        <div class="desc">Entraîneur de trading — algorithme génétique, réseau de neurones</div>
        <div class="type">Service</div>
      </div>
    </div>

    <hr>

    <h2>Liens utiles</h2>
    <ul style="margin-top:0.5rem; color:#8b8fa3;">
      <li><a href="https://github.com/docteur-turboss/trading-model" style="color:#7c9cf0;">GitHub</a></li>
      <li><a href="../../../docs/QUICKSTART.md" style="color:#7c9cf0;">Quickstart</a></li>
      <li><a href="../../../docs/ARCHITECTURE.md" style="color:#7c9cf0;">Architecture</a></li>
    </ul>

    <footer>Generated using <a href="https://typedoc.org/">TypeDoc</a></footer>
  </div>
</body>
</html>`;

const indexPath = join(OUT_DIR, 'index.html');
const { writeFileSync } = await import('node:fs');
writeFileSync(indexPath, indexHtml, 'utf-8');

console.log(`\n✓ Root index: ${indexPath}`);
console.log('Done.');
