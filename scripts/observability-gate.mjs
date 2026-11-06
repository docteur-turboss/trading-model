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
//    5. Every service registers at least one dependency-aware readiness check
//       (no more readiness: [] no-op gates).
//    6. Compose (observability/alerting.yml) and K8s (prometheus ConfigMap)
//       evaluate the same alert rules (name, expr, for, labels, annotations),
//       and every rule has a runbook_url on main naming a file of the
//       repository (and one of its headings, for an #anchor).
//    7. Every metric an alert reads is emitted by a service, a backup script or
//       a configured exporter.
//    8. Alerts reach someone: compose and K8s run the same Alertmanager config,
//       every receiver reads its credentials from a file (no inline
//       placeholder), and the Watchdog alert is routed to a dead man's switch.
//    9. Every curl to https:// in docs/operations and docs/troubleshooting
//       passes a client certificate (--cert): services are mTLS only.
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

// ── 5: dependency-aware readiness ────────────────────────────────────────────
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

function alertRules(yamlText) {
  const rules = new Map();
  for (const group of Bun.YAML.parse(yamlText).groups ?? []) {
    for (const rule of group.rules ?? []) {
      if (rule.alert) rules.set(rule.alert, rule);
    }
  }
  return rules;
}

function k8sAlertingConfig() {
  const manifest = readFileSync(join(ROOT, "deploy", "k8s", "infra", "prometheus.yaml"), "utf-8");
  for (const doc of manifest.split(/^---$/m)) {
    const parsed = Bun.YAML.parse(doc);
    if (parsed?.data?.["alerting.yml"]) return parsed.data["alerting.yml"];
  }
  errors.push("deploy/k8s/infra/prometheus.yaml: no alerting.yml ConfigMap entry");
  return "groups: []";
}

const PROMQL_WORDS = new Set([
  "abs", "absent", "and", "avg", "bool", "by", "ceil", "count", "delta", "deriv", "group_left",
  "group_right", "histogram_quantile", "humanizePercentage", "ignoring", "increase",
  "irate", "max", "max_over_time", "min", "offset", "on", "or", "rate", "sum", "time", "topk", "unless", "vector",
  "without",
]);

/** Metric names of a PromQL expression: label matchers, ranges and strings removed. */
function promqlMetricNames(expr) {
  const bare = expr
    .replace(/"[^"]*"/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\b(by|without|on|ignoring)\s*\([^)]*\)/g, "");
  const names = bare.match(/[a-zA-Z_:][a-zA-Z0-9_:]*/g) ?? [];
  return [...new Set(names.filter((name) => !PROMQL_WORDS.has(name)))];
}

/** Every metric name the platform exports. */
function emittedMetricNames() {
  const names = new Set(["up"]); // Prometheus target health
  // prom-client metrics declared in TypeScript (`name: "..."` next to new Counter/Gauge/...)
  for (const dir of ["packages", "services"]) {
    for (const workspace of readdirSync(join(ROOT, dir))) {
      const src = join(ROOT, dir, workspace, "src");
      if (!existsSync(src)) continue;
      for (const file of walk(src)) {
        const source = readFileSync(file, "utf-8");
        if (!source.includes("prom-client")) continue;
        for (const match of source.matchAll(/\bname:\s*["'`]([a-zA-Z_:][a-zA-Z0-9_:]*)["'`]/g)) {
          names.add(match[1]);
        }
      }
    }
  }
  // text-format metrics written by the backup scripts (scripts/backup-lib.sh)
  for (const file of readdirSync(join(ROOT, "scripts")).filter((f) => f.endsWith(".sh"))) {
    const source = readFileSync(join(ROOT, "scripts", file), "utf-8");
    for (const match of source.matchAll(/echo\s+"([a-z_:][a-z0-9_:]*)[{ ]/g)) names.add(match[1]);
  }
  return names;
}

/** Families exported by components this repo configures but does not code. */
const EXPORTER_PREFIXES = [
  // prom-client collectDefaultMetrics() (packages/server-utils configure-app)
  "nodejs_", "process_",
  // blackbox-exporter probes (deploy/k8s/infra/blackbox-exporter.yaml)
  "probe_",
  // Alertmanager and Prometheus themselves (scrape jobs `alertmanager`, `prometheus`)
  "alertmanager_", "prometheus_",
];

function isEmitted(metric, emitted) {
  const base = metric.replace(/_(bucket|sum|count)$/, "");
  return (
    emitted.has(metric) ||
    emitted.has(base) ||
    EXPORTER_PREFIXES.some((prefix) => metric.startsWith(prefix))
  );
}

const RUNBOOK_URL_PREFIX = "https://github.com/docteur-turboss/trading-model/blob/main/";

/** GitHub anchors of a Markdown file's headings (fenced code skipped, duplicates suffixed -1, -2...). */
function markdownAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!heading) continue;
    const slug = heading[1]
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}

/** Why a rule's runbook_url does not lead to a procedure of this repository, or null. */
function runbookUrlProblem(url) {
  if (!url) return "no annotations.runbook_url (every alert links its runbook)";
  if (!url.startsWith(RUNBOOK_URL_PREFIX)) return `runbook_url ${url} does not start with ${RUNBOOK_URL_PREFIX}`;
  const [path, anchor] = url.slice(RUNBOOK_URL_PREFIX.length).split("#");
  const file = join(ROOT, path);
  if (relative(ROOT, file).startsWith("..")) return `runbook_url names ${path}, outside the repository`;
  if (!existsSync(file) || !statSync(file).isFile()) return `runbook_url names ${path}, absent from the repository`;
  if (anchor !== undefined && !markdownAnchors(readFileSync(file, "utf-8")).has(anchor)) {
    return `runbook_url anchor #${anchor} matches no heading of ${path}`;
  }
  return null;
}

// ── 6 + 7: alert rules: same rules everywhere, on metrics that exist ─────────
{
  const composeRules = alertRules(
    readFileSync(join(ROOT, "observability", "alerting.yml"), "utf-8")
  );
  const k8sRules = alertRules(k8sAlertingConfig());

  // 7. compose and K8s evaluate the same rules and tell on-call the same
  //    thing (annotations included: the runbook_url above all).
  const ruleKey = (rule) =>
    JSON.stringify({
      expr: rule.expr,
      for: rule.for,
      labels: rule.labels ?? {},
      annotations: rule.annotations ?? {},
    });
  for (const [name, rule] of composeRules) {
    const other = k8sRules.get(name);
    if (!other) errors.push(`Alert ${name}: in observability/alerting.yml, missing from deploy/k8s/infra/prometheus.yaml`);
    else if (ruleKey(rule) !== ruleKey(other)) {
      errors.push(`Alert ${name}: expr/for/labels/annotations differ between compose and K8s`);
    }
  }

  // 7b. every rule links its procedure: a runbook_url on main that names a
  //     file of this repository (and a heading of it, for an #anchor).
  for (const [name, rule] of composeRules) {
    const problem = runbookUrlProblem(rule.annotations?.runbook_url);
    if (problem) errors.push(`Alert ${name}: ${problem}`);
  }
  for (const name of k8sRules.keys()) {
    if (!composeRules.has(name)) {
      errors.push(`Alert ${name}: in deploy/k8s/infra/prometheus.yaml, missing from observability/alerting.yml`);
    }
  }

  // 8. every metric an alert reads is emitted: an alert on a metric nobody
  //    exports never fires (ca_certificate_last_renewed outlived the CA).
  const emitted = emittedMetricNames();
  for (const [name, rule] of composeRules) {
    for (const metric of promqlMetricNames(rule.expr)) {
      if (!isEmitted(metric, emitted)) {
        errors.push(`Alert ${name}: metric ${metric} is emitted by no service, script or exporter`);
      }
    }
  }
  info.push(`${composeRules.size} alert rules, identical in compose and K8s, all on emitted metrics, each with a runbook in the repository`);
}

// ── 8: Alertmanager: one config, file-based credentials, dead man's switch ───
{
  const compose = Bun.YAML.parse(readFileSync(join(ROOT, "observability", "alertmanager.yml"), "utf-8"));
  let k8s;
  const manifest = readFileSync(join(ROOT, "deploy", "k8s", "infra", "alertmanager.yaml"), "utf-8");
  for (const doc of manifest.split(/^---$/m)) {
    const parsed = Bun.YAML.parse(doc);
    if (parsed?.data?.["alertmanager.yml"]) k8s = Bun.YAML.parse(parsed.data["alertmanager.yml"]);
  }
  if (!k8s) errors.push("deploy/k8s/infra/alertmanager.yaml: no alertmanager.yml ConfigMap entry");
  else if (JSON.stringify(k8s) !== JSON.stringify(compose)) {
    errors.push("Alertmanager config differs between observability/alertmanager.yml and the K8s ConfigMap");
  }
  // An inline credential is a placeholder (CHANGE_ME sent every alert nowhere)
  // or a leaked secret: receivers read theirs from files.
  if (/"(slack_api_url|api_url|routing_key|service_key|user_key|token|url)":/.test(JSON.stringify(compose))) {
    errors.push("observability/alertmanager.yml: inline receiver credential, use the *_file form");
  }
  const watchdogRoute = (compose.route?.routes ?? []).find((route) =>
    (route.matchers ?? []).some((matcher) => /alertname\s*=\s*"?Watchdog"?/.test(matcher))
  );
  const deadman = (compose.receivers ?? []).find((r) => r.name === watchdogRoute?.receiver);
  if (!deadman?.webhook_configs?.length) {
    errors.push("observability/alertmanager.yml: the Watchdog alert is not routed to a webhook (dead man's switch)");
  }
  info.push("Alertmanager: same config in compose and K8s, file-based credentials, Watchdog → dead man's switch");
}

// ── 9: On-call diagnostics reach mTLS services with a client SVID ────────────
// Services refuse clients without a SPIFFE certificate (ADR-0011): a runbook
// `curl https://…` without --cert fails even on a healthy service.
{
  const docs = [];
  const walkDocs = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walkDocs(p);
      else if (p.endsWith(".md")) docs.push(p);
    }
  };
  for (const dir of ["docs/operations", "docs/troubleshooting"]) walkDocs(join(ROOT, dir));
  for (const file of docs) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    // Join shell continuations so a multi-line curl is checked as one command.
    const commands = readFileSync(file, "utf-8").replace(/\\\r?\n/g, " ").split(/\r?\n/);
    for (const line of commands) {
      for (const command of line.split(/`|\||&&|;/)) {
        if (/\bcurl\b/.test(command) && /https:\/\//.test(command) && !/--cert\b/.test(command)) {
          errors.push(`${rel}: curl to https:// without --cert/--key (mTLS only, ADR-0011): ${command.trim()}`);
        }
      }
    }
  }
  info.push(`On-call docs: every curl to https:// carries a client SVID (${docs.length} files)`);
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