#!/usr/bin/env bun
// =============================================================================
//  observability-gate.mjs — CI gate for observability invariants
//
//  Fails the build when observability regressions appear:
//    1. Every service defines metrics and mounts a /metrics route.
//    2. No service metric is dead code (exported but never referenced outside
//       its definition file).
//    3. Shared HTTP middleware (correlation id + http metrics) is mounted.
//    4. Outgoing correlation/trace propagation is wired in the HTTP client.
//    5. Frontend telemetry (web-vitals + ErrorBoundary) is present.
//    6. Every service registers at least one dependency-aware readiness check
//       (no more readiness: [] no-op gates).
//
//  Run: bun scripts/observability-gate.mjs
// =============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SERVICES = [
  "discovery-server",
  "message-manager",
  "financial-scraper",
  "trader-trainer",
  "api-gateway",
  "audit-logger",
  "dlq-service",
];

const METRIC_DEF_RE =
  /export\s+const\s+([A-Z0-9_]+)\s*=\s*new\s+(?:promClient\.)?(Counter|Gauge|Histogram|Summary)\b/g;

const errors = [];
const info = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function serviceFiles(service) {
  return walk(join(ROOT, "services", service, "src")).map((p) =>
    p.replace(/\\/g, "/")
  );
}

// ── 1 + 2: /metrics routes + dead metric detection ──────────────────────────
for (const service of SERVICES) {
  const files = serviceFiles(service);

  const hasMetricsRoute = files.some((f) => {
    const content = readFileSync(f, "utf-8");
    return content.includes('"/metrics"') && content.includes("metricsHandler");
  });
  if (!hasMetricsRoute) {
    errors.push(`${service}: /metrics route with metricsHandler not found`);
  } else {
    info.push(`${service}: /metrics route present`);
  }

  const definitionFiles = files.filter((f) => f.endsWith("/metrics.ts"));
  for (const def of definitionFiles) {
    const source = readFileSync(def, "utf-8");
    const definitions = [...source.matchAll(METRIC_DEF_RE)];
    if (definitions.length === 0) continue;
    info.push(
      `${service}: ${definitions.length} metrics defined in ${relative(ROOT, def)}`
    );
    for (const match of definitions) {
      const name = match[1];
      const referencedElsewhere = files.some(
        (f) =>
          f !== def &&
          new RegExp(`\\b${name}\\b`).test(readFileSync(f, "utf-8"))
      );
      if (!referencedElsewhere) {
        errors.push(
          `Dead metric: ${name} defined in ${relative(ROOT, def)} is never referenced outside its definition file`
        );
      }
    }
  }
}

// ── 3: shared middleware mounted ─────────────────────────────────────────────
{
  const configureAppPath = join(
    ROOT,
    "packages",
    "server-utils",
    "src",
    "adapters",
    "inbound",
    "configure-app.ts"
  );
  const configureApp = readFileSync(configureAppPath, "utf-8");
  if (!configureApp.includes("httpMetricsMiddleware")) {
    errors.push("server-utils: httpMetricsMiddleware not mounted in configure-app");
  }
  if (!configureApp.includes("correlationIdMiddleware")) {
    errors.push("server-utils: correlationIdMiddleware not mounted in configure-app");
  }
  if (!configureApp.includes('"/health/ready"')) {
    errors.push("server-utils: /health/ready readiness route not mounted");
  }
}

// ── 4: outgoing correlation/trace propagation ────────────────────────────────
{
  const httpUtilsPath = join(
    ROOT,
    "packages",
    "http",
    "src",
    "infrastructure",
    "http-utils.ts"
  );
  const httpUtils = readFileSync(httpUtilsPath, "utf-8");
  if (!httpUtils.includes("propagation.inject")) {
    errors.push("packages/http: outgoing trace propagation (propagation.inject) missing");
  }
  if (!httpUtils.includes("getCorrelationId")) {
    errors.push("packages/http: outgoing correlation propagation (getCorrelationId) missing");
  }
}

// ── 5: frontend telemetry ────────────────────────────────────────────────────
{
  const pkg = JSON.parse(
    readFileSync(join(ROOT, "services", "admin-interface", "package.json"), "utf-8")
  );
  if (!pkg.dependencies?.["web-vitals"]) {
    errors.push("admin-interface: web-vitals dependency missing");
  }
  const errorBoundaryPath = join(
    ROOT,
    "services",
    "admin-interface",
    "src",
    "components",
    "error-boundary.tsx"
  );
  if (!existsSync(errorBoundaryPath)) {
    errors.push("admin-interface: error-boundary.tsx missing");
  }
  const appTsx = readFileSync(
    join(ROOT, "services", "admin-interface", "src", "infrastructure", "app", "app.tsx"),
    "utf-8"
  );
  if (!appTsx.includes("ErrorBoundary")) {
    errors.push("admin-interface: ErrorBoundary not mounted in app.tsx");
  }
}

// ── 6: dependency-aware readiness ────────────────────────────────────────────
for (const service of SERVICES) {
  const files = serviceFiles(service);
  const serverFile = files.find((f) => f.endsWith("/application/server.ts") || f.endsWith("/app/server.ts"));
  if (!serverFile) continue;
  const content = readFileSync(serverFile, "utf-8");
  const readinessMatch = content.match(/readiness:\s*\[\s*\]/);
  if (readinessMatch) {
    errors.push(`${service}: readiness is an empty array — /health/ready is a no-op`);
  }
}

if (errors.length > 0) {
  console.error("\n  Observability gate FAILED:");
  for (const error of errors) console.error(`    ✗ ${error}`);
  console.error("\n");
  process.exit(1);
}

console.log("\n  Observability gate PASSED");
for (const line of info) console.log(`    ✓ ${line}`);
console.log("\n");