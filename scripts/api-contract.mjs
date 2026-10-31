#!/usr/bin/env bun
// =============================================================================
//  api-contract.mjs — HTTP API contract between the code, its OpenAPI and its
//  documentation.
//
//  The routes are read from the services' Express route declarations (TypeScript
//  AST, not regexes). From them:
//    1. docs/services/openapi/api-gateway.yaml is generated (`--write`) from
//       the gateway's PUBLIC_ROUTES and checked to be up to date (default):
//       editing the spec by hand, or adding a route without regenerating it,
//       fails CI. Every route of a proxied service must be either public or
//       service-to-service, and every public route must exist.
//       Routes mounted from a registry entry (`mountRoute(router, X.key, ...)`,
//       ADR-0021) take their parameters, body and responses from the entry's
//       Zod schemas; public routes without an entry are known gaps.
//       Service-to-service routes must all come from an entry: they are
//       published per service in docs/services/openapi/internal/<service>.yaml.
//    2. The documentation cannot describe routes that do not exist: gateway
//       URLs (`/v1/<service>/...`, public routes only) in any Markdown file, and the route tables
//       of docs/services/<service>.md. Entries already broken are listed in
//       api-contract-known-gaps.json: a new broken entry fails, and so does a
//       listed entry that now works or no longer exists (the list can only
//       shrink).
//
//  There is no frontend consumer to check (admin-interface removed, ADR-0018).
//
//  Runs under bun: the registries are TypeScript, loaded from the workspace
//  sources (no build needed, pre-push runs this before building) through the
//  paths of scripts/api-contract.tsconfig.json.
//
//  Usage: bun run api:check | bun run api:write
// =============================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = resolve(import.meta.dirname, "..");
const SPEC_PATH = join(ROOT, "docs/services/openapi/api-gateway.yaml");
const KNOWN_GAPS_PATH = join(ROOT, "scripts/api-contract-known-gaps.json");
const IDENTITY_PATH = join(ROOT, "packages/common/src/config/workload-identity.ts");
const PUBLIC_ROUTES_PATH = join(ROOT, "services/api-gateway/src/shared/public-routes.ts");
const API_MAJOR_VERSION = 1;

/** Services the gateway proxies to, by canonical (SPIFFE) name. */
const PROXIED_SERVICES = [
	"audit-logger",
	"discovery-server",
	"dlq-service",
	"financial-scraper",
	"message-manager",
	"trader-trainer",
];

/** Routes of proxied services that the gateway does not expose (PUBLIC_ROUTES). */
const INFRASTRUCTURE_PATHS = new Set(["/metrics", "/health", "/health/ready", "/ping", "/status"]);
const SERVICE_TO_SERVICE = {
	"discovery-server": ["POST /register", "POST /heartbeat", "POST /token/rotate", "POST /unregister"],
	"audit-logger": ["POST /message"],
	"financial-scraper": ["POST /message"],
	"message-manager": ["POST /message", "POST /subscribe", "DELETE /subscribe"],
	// Model weights: never through the gateway (ADR-0022).
	"trader-trainer": ["POST /message", "GET /models/:symbol/:version/weights"],
};

/**
 * Routes a service gets from a package, when its source calls the mounting
 * function. `files` are read like service sources; `routes` are declared here
 * when the package builds the path at runtime.
 */
const ROUTE_PROVIDERS = [
	{
		mountedBy: /createServiceServer\(|createSecureServer\(/,
		files: ["packages/server-utils/src/adapters/inbound/configure-app.ts"],
	},
	{
		mountedBy: /ADDRESS_MANAGER_ROUTES\(/,
		files: [
			"packages/address-manager/src/infrastructure/monitoring/metrics-collector.ts",
			"packages/address-manager/src/adapters/inbound/routes/ping.routes.ts",
			"packages/address-manager/src/adapters/inbound/routes/metrics.routes.ts",
		],
	},
	{
		// broker-message CREATE_CALLBACK_ROUTE, default callback path "message"
		mountedBy: /MessageManagerListenExpress\(/,
		routes: [
			{
				method: "POST",
				path: "/message",
				file: "packages/broker-message/src/adapters/inbound/messages.routes.ts",
				registry: { file: "packages/broker-message/src/adapters/inbound/api-routes.ts", name: "BROKER_CALLBACK_API", key: "receive" },
			},
		],
	},
];

/** Markdown read for gateway URLs (generated TypeDoc output excluded). */
const DOC_ROOTS = ["README.md", "docs", "services", "packages", "deploy"];
const DOC_EXCLUDED = /(^|\/)(node_modules|dist|coverage)\/|^docs\/architecture\/code\//;

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const ROUTE_RECEIVER = /^(app|router)$/i;

const errors = [];

// ── Source walking ───────────────────────────────────────────────────────────

function walk(dir, out = [], extension = /\.tsx?$/) {
	for (const entry of readdirSync(dir)) {
		if (["node_modules", "dist", "coverage", ".git"].includes(entry)) continue;
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, out, extension);
		else if (extension.test(path) && !/\.(spec|test)\.tsx?$/.test(path)) out.push(path);
	}
	return out;
}

function parse(file) {
	return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

function visit(node, fn) {
	fn(node);
	ts.forEachChild(node, (child) => visit(child, fn));
}

function rel(file) {
	return relative(ROOT, file).replaceAll("\\", "/");
}

// ── Route extraction ─────────────────────────────────────────────────────────

/** `const NAME = "/..."` declarations, to resolve routes declared with a constant. */
function pathConstants(files) {
	const constants = new Map();
	for (const file of files) {
		visit(parse(file), (node) => {
			if (
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				node.initializer &&
				ts.isStringLiteralLike(node.initializer) &&
				node.initializer.text.startsWith("/")
			) {
				const previous = constants.get(node.name.text);
				constants.set(node.name.text, previous && previous !== node.initializer.text ? null : node.initializer.text);
			}
		});
	}
	return constants;
}

/**
 * `router.get("/x", ...)` / `app.post(PATH, ...)` declarations of some files.
 * Mounts other than `use("/", ...)` would shift every path below them: the
 * extractor does not resolve them, so it refuses them instead of guessing.
 */
function declaredRoutes(files, constants, mounts = []) {
	const routes = [];
	for (const file of files) {
		visit(parse(file), (node) => {
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "mountRoute") {
				const entry = node.arguments[1];
				if (entry && ts.isPropertyAccessExpression(entry) && ts.isIdentifier(entry.expression)) {
					mounts.push({ registry: entry.expression.text, key: entry.name.text, file: rel(file) });
				} else {
					errors.push(`${rel(file)}: mountRoute(${entry?.getText() ?? ""}) must name its entry as REGISTRY.key`);
				}
				return;
			}
			if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
			const method = node.expression.name.text;
			if (method !== "use" && !HTTP_METHODS.has(method)) return;
			const receiver = node.expression.expression.getText();
			const [first] = node.arguments;
			if (!first) return;
			let path = null;
			if (ts.isStringLiteralLike(first)) path = first.text;
			else if (ts.isIdentifier(first) && constants.get(first.text)) path = constants.get(first.text);
			else if (method !== "use" && ROUTE_RECEIVER.test(receiver)) {
				errors.push(`${rel(file)}: cannot resolve the path of ${receiver}.${method}(${first.getText()})`);
				return;
			}
			if (path === null || !path.startsWith("/")) return;
			if (method === "use") {
				if (path !== "/") {
					errors.push(`${rel(file)}: mount prefix "${path}" is not supported by ${rel(import.meta.filename)}`);
				}
				return;
			}
			routes.push({ method: method.toUpperCase(), path, file: rel(file) });
		});
	}
	return routes;
}

// ── Route registries (ADR-0021) ─────────────────────────────────────────────

if (typeof Bun === "undefined") {
	console.error("api-contract.mjs loads the TypeScript route registries: run it with bun");
	process.exit(1);
}

/**
 * `@trading-model/<pkg>/<sub>` must load the package source, so nothing needs
 * building (pre-push runs this before the build, CI's lint job never builds):
 * the scripts run with --tsconfig-override=scripts/api-contract.tsconfig.json,
 * whose `paths` map every package to its `src`. Without it the registries
 * would silently use whatever `dist/` holds.
 */
const SOURCE_PATHS = join(ROOT, "scripts/api-contract.tsconfig.json");
{
	const mapped = Object.keys(JSON.parse(readFileSync(SOURCE_PATHS, "utf8")).compilerOptions.paths);
	for (const name of readdirSync(join(ROOT, "packages"))) {
		if (existsSync(join(ROOT, "packages", name, "src")) && !mapped.includes(`@trading-model/${name}/*`)) {
			errors.push(`${rel(SOURCE_PATHS)} does not map @trading-model/${name}/* to its src`);
		}
	}
	const probe = Bun.resolveSync(
		"@trading-model/http/adapters/inbound/api-route/api-route",
		join(ROOT, "services/dlq-service/src")
	);
	if (!probe.replaceAll("\\", "/").includes("/packages/http/src/")) {
		console.error(`@trading-model/* resolves to ${probe}, not to the sources: run through \`bun run api:check\``);
		process.exit(1);
	}
}

const REGISTRY_PATHS = ["src/adapters/inbound/http/api-routes.ts", "src/adapters/inbound/api-routes.ts"];

function isApiRoute(value) {
	return Boolean(value) && typeof value === "object" && typeof value.method === "string" &&
		typeof value.path === "string" && typeof value.responses === "object";
}

/** Exported registries of a service: `{ NAME: { key: ApiRoute } }`, and the file. */
async function loadRegistry(service) {
	const file = REGISTRY_PATHS.map((path) => join(ROOT, "services", service, path)).find(existsSync);
	if (!file) return null;
	const module = await import(file);
	const registries = Object.fromEntries(
		Object.entries(module).filter(
			([, value]) => value && typeof value === "object" && Object.values(value).some(isApiRoute)
		)
	);
	return { file: rel(file), registries };
}

const REGISTRIES = Object.fromEntries(
	await Promise.all(
		["api-gateway", ...PROXIED_SERVICES].map(async (service) => [service, await loadRegistry(service)])
	)
);

/** Entries of the routes a package mounts for a service (ROUTE_PROVIDERS `registry`). */
const PROVIDER_ENTRIES = new Map();
for (const provider of ROUTE_PROVIDERS) {
	for (const route of provider.routes ?? []) {
		if (!route.registry) continue;
		const { file, name, key } = route.registry;
		const entry = (await import(join(ROOT, file)))[name]?.[key];
		if (!isApiRoute(entry) || entry.method !== route.method || entry.path !== route.path) {
			errors.push(`route provider: ${file} ${name}.${key} is not the entry of ${route.method} ${route.path}`);
			continue;
		}
		PROVIDER_ENTRIES.set(route, { entry, operation: key });
	}
}

/** Routes mounted with mountRoute, resolved to their entry; every entry mounted once. */
function registryRoutes(service, mounts) {
	const loaded = REGISTRIES[service];
	const routes = [];
	const mounted = new Set();
	for (const mount of mounts) {
		const entry = loaded?.registries[mount.registry]?.[mount.key];
		if (!isApiRoute(entry)) {
			errors.push(`${mount.file}: mountRoute(router, ${mount.registry}.${mount.key}) is not an entry of ${loaded?.file ?? `services/${service}/${REGISTRY_PATHS[0]}`}`);
			continue;
		}
		const id = `${mount.registry}.${mount.key}`;
		if (mounted.has(id)) errors.push(`${mount.file}: ${id} is mounted twice`);
		mounted.add(id);
		routes.push({ method: entry.method, path: entry.path, file: mount.file, entry, operation: mount.key });
	}
	for (const [name, registry] of Object.entries(loaded?.registries ?? {})) {
		for (const key of Object.keys(registry)) {
			if (!mounted.has(`${name}.${key}`)) errors.push(`${loaded.file}: ${name}.${key} is declared but never mounted`);
		}
	}
	return routes;
}

const PACKAGE_CONSTANTS = pathConstants(
	readdirSync(join(ROOT, "packages")).flatMap((name) => {
		const src = join(ROOT, "packages", name, "src");
		return statSync(src, { throwIfNoEntry: false }) ? walk(src) : [];
	})
);

function extractServiceRoutes(service) {
	const files = walk(join(ROOT, "services", service, "src"));
	const constants = new Map([...PACKAGE_CONSTANTS, ...pathConstants(files)]);
	const mounts = [];
	const routes = declaredRoutes(files, constants, mounts);
	routes.push(...registryRoutes(service, mounts));
	// A rename of the route registration must not silently empty a service.
	if (routes.length === 0) errors.push(`services/${service}: no route found`);

	const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
	for (const provider of ROUTE_PROVIDERS) {
		if (!provider.mountedBy.test(source)) continue;
		if (provider.routes) {
			routes.push(...provider.routes.map((route) => ({ ...route, ...PROVIDER_ENTRIES.get(route) })));
		}
		if (provider.files) {
			const providerFiles = provider.files.map((file) => join(ROOT, file));
			for (const file of providerFiles) {
				if (!statSync(file, { throwIfNoEntry: false })) errors.push(`route provider ${rel(file)} not found`);
			}
			routes.push(...declaredRoutes(providerFiles.filter((f) => statSync(f, { throwIfNoEntry: false })), constants));
		}
	}
	const unique = new Map(routes.map((route) => [routeKey(route), route]));
	return [...unique.values()];
}

function routeKey(route) {
	return `${route.method} ${route.path}`;
}

function isGatewayExternal(route) {
	return !["/metrics", "/health/ready"].includes(route.path);
}

function isInternal(service, route) {
	return INFRASTRUCTURE_PATHS.has(route.path) || (SERVICE_TO_SERVICE[service] ?? []).includes(routeKey(route));
}

/** The gateway's PUBLIC_ROUTES (`METHOD /<service>/<path>`), by service. */
function readPublicRoutes() {
	const entries = [];
	visit(parse(PUBLIC_ROUTES_PATH), (node) => {
		if (!ts.isVariableDeclaration(node) || node.name.getText() !== "PUBLIC_ROUTES" || !node.initializer) return;
		let init = node.initializer;
		while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) init = init.expression;
		if (!ts.isArrayLiteralExpression(init)) return;
		for (const el of init.elements) {
			if (ts.isStringLiteralLike(el)) entries.push(el.text);
			else errors.push(`${rel(PUBLIC_ROUTES_PATH)}: PUBLIC_ROUTES entry ${el.getText()} is not a string literal`);
		}
	});
	if (entries.length === 0) errors.push(`${rel(PUBLIC_ROUTES_PATH)}: PUBLIC_ROUTES not found`);
	const byService = Object.fromEntries(PROXIED_SERVICES.map((service) => [service, []]));
	for (const entry of entries) {
		const match = entry.match(/^(GET|POST|PUT|PATCH|DELETE) \/([a-z][a-z0-9-]*)(\/\S*)$/);
		if (!match || !byService[match[2]]) {
			errors.push(`PUBLIC_ROUTES: "${entry}" is not "METHOD /<proxied service>/<path>"`);
			continue;
		}
		byService[match[2]].push({ method: match[1], path: match[3] });
	}
	return byService;
}

/**
 * Public routes must exist, and must not be service-to-service routes; every
 * other route must be declared internal, so a new route is a deliberate choice.
 */
function checkRouteClassification(routesByService, publicByService) {
	for (const service of PROXIED_SERVICES) {
		const actual = new Map(routesByService[service].map((route) => [routeKey(route), route]));
		const publicKeys = new Set(publicByService[service].map(routeKey));
		for (const route of publicByService[service]) {
			if (!actual.has(routeKey(route))) {
				errors.push(`PUBLIC_ROUTES lists "${routeKey(route)}" of ${service}, which has no such route`);
			} else if (isInternal(service, route)) {
				errors.push(`PUBLIC_ROUTES lists "${routeKey(route)}" of ${service}, which is a service-to-service route`);
			}
		}
		for (const [key, route] of actual) {
			if (!(publicKeys.has(key) || isInternal(service, route))) {
				errors.push(
					`${service} ${key} (${route.file}) is neither in PUBLIC_ROUTES (${rel(PUBLIC_ROUTES_PATH)}) ` +
						"nor in SERVICE_TO_SERVICE: classify it"
				);
			}
		}
	}
}

function checkServiceToServiceList(routesByService) {
	for (const [service, keys] of Object.entries(SERVICE_TO_SERVICE)) {
		const actual = new Set(routesByService[service].map(routeKey));
		for (const key of keys) {
			if (!actual.has(key)) {
				errors.push(`SERVICE_TO_SERVICE lists "${service} ${key}", which no longer exists`);
			}
		}
	}
}

// ── OpenAPI generation ───────────────────────────────────────────────────────

function toOpenApiPath(path) {
	return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function pathParams(path) {
	return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

function operationId(method, path) {
	const words = path.split(/[^A-Za-z0-9]+/).filter(Boolean);
	return [method.toLowerCase(), ...words.map((w) => w[0].toUpperCase() + w.slice(1))].join("");
}

// Zod of the http package, which owns ErrorResponse: the registries' schemas
// are converted with it.
const { z } = createRequire(join(ROOT, "packages/http/package.json"))("zod");
const { ErrorResponse } = await import(join(ROOT, "packages/http/src/adapters/inbound/api-route/api-route.ts"));
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/** JSON Schema of a Zod schema, OpenAPI 3.0 flavour, without Zod's noise. */
function jsonSchema(schema, io) {
	const clean = (node) => {
		if (Array.isArray(node)) return node.map(clean);
		if (!node || typeof node !== "object") return node;
		const out = {};
		for (const [key, value] of Object.entries(node)) {
			if (key === "minimum" && value === -MAX_SAFE) continue;
			if (key === "maximum" && value === MAX_SAFE) continue;
			// format: date-time says it; Zod adds a 300-character regex.
			if (key === "pattern" && node.format === "date-time") continue;
			out[key] = clean(value);
		}
		return out;
	};
	try {
		return clean(z.toJSONSchema(schema, { target: "openapi-3.0", io }));
	} catch (err) {
		throw new Error(`${io === "output" ? "response" : "request"} schema: ${err.message}`);
	}
}

const ERROR_RESPONSE_JSON = JSON.stringify(jsonSchema(ErrorResponse, "output"));

/** A response schema, as a reference when it is the shared ErrorResponse. */
function responseSchema(schema) {
	const json = jsonSchema(schema, "output");
	return JSON.stringify(json) === ERROR_RESPONSE_JSON ? { $ref: "#/components/schemas/ErrorResponse" } : json;
}

/** YAML block lines of a JSON value (strings JSON-quoted: always valid YAML). */
function yaml(value, indent) {
	const pad = " ".repeat(indent);
	const scalar = (v) => (typeof v === "string" ? JSON.stringify(v) : String(v));
	const isEmpty = (v) => v && typeof v === "object" && Object.keys(v).length === 0;
	const empty = (v) => (Array.isArray(v) ? "[]" : "{}");
	const lines = [];
	if (Array.isArray(value)) {
		for (const item of value) {
			if (item && typeof item === "object" && !isEmpty(item)) {
				const [first, ...rest] = yaml(item, indent + 2);
				lines.push(`${pad}- ${first.trimStart()}`, ...rest);
			} else {
				lines.push(`${pad}- ${isEmpty(item) ? empty(item) : scalar(item)}`);
			}
		}
		return lines;
	}
	for (const [key, v] of Object.entries(value)) {
		const name = /^[A-Za-z_$][\w$-]*$/.test(key) ? key : JSON.stringify(key);
		if (v && typeof v === "object" && !isEmpty(v)) {
			lines.push(`${pad}${name}:`, ...yaml(v, indent + 2));
		} else {
			lines.push(`${pad}${name}: ${isEmpty(v) ? empty(v) : scalar(v)}`);
		}
	}
	return lines;
}

const STATUS_TEXT = {
	200: "OK",
	201: "Created",
	204: "No content",
	400: "Invalid request",
	401: "Missing or invalid credentials",
	403: "Caller not allowed",
	404: "Not found",
	409: "Conflict",
	429: "Too many requests",
	500: "Internal error",
	503: "Service unavailable",
};

/** OpenAPI security schemes of the credentials an entry declares (ApiRoute `security`). */
const SECURITY_SCHEMES = {
	SignedRequest: {
		ServiceName: {
			type: "apiKey",
			in: "header",
			name: "x-service-name",
			description: "Calling service of a signed request (must be allowed by the target service)",
		},
		RequestTimestamp: {
			type: "apiKey",
			in: "header",
			name: "x-timestamp",
			description: "Epoch milliseconds of a signed request (5 minutes of validity)",
		},
		RequestSignature: {
			type: "apiKey",
			in: "header",
			name: "x-signature",
			description:
				"Hex HMAC-SHA256(secret, '<x-service-name>:<x-timestamp>:<sha256 hex of the JSON body, or of {} without body>:<METHOD>:<service path>'), see examples/manage-dlq.sh",
		},
	},
	InstanceToken: {
		InstanceToken: {
			type: "apiKey",
			in: "header",
			name: "x-instance-token",
			description: "Token discovery-server returned to the instance at registration (or its last rotation)",
		},
	},
};

/** Security requirement of an operation: the gateway API key, then the entry's credentials. */
function securityOf(entry, gateway) {
	const requirement = gateway ? { ApiKeyAuth: [] } : {};
	for (const credential of entry.security ?? []) {
		if (!SECURITY_SCHEMES[credential]) throw new Error(`unknown security "${credential}" in ${entry.method} ${entry.path}`);
		for (const name of Object.keys(SECURITY_SCHEMES[credential])) requirement[name] = [];
	}
	return requirement;
}

/** Operation of a route mounted from its registry entry; `gateway` adds the gateway's own answers. */
function schemaOperation(lines, method, path, { tag, entry, operation: key }, gateway = true) {
	const op = {
		operationId: operationId(method, path),
		tags: [tag],
		summary: entry.summary,
		"x-registry-entry": key,
	};
	if (entry.security?.length) {
		op.security = [securityOf(entry, gateway)];
	}
	const params = [];
	const pathSchema = entry.params ? jsonSchema(entry.params, "input") : { properties: {} };
	for (const name of pathParams(path)) {
		params.push({ name, in: "path", required: true, schema: pathSchema.properties?.[name] ?? { type: "string" } });
	}
	if (entry.query) {
		const query = jsonSchema(entry.query, "input");
		for (const [name, schema] of Object.entries(query.properties ?? {})) {
			params.push({ name, in: "query", required: (query.required ?? []).includes(name), schema });
		}
	}
	if (params.length > 0) op.parameters = params;
	if (entry.body) {
		op.requestBody = { required: true, content: { "application/json": { schema: jsonSchema(entry.body, "input") } } };
	}
	const responses = {};
	for (const [status, schema] of Object.entries(entry.responses)) {
		responses[status] = { description: STATUS_TEXT[status] ?? `HTTP ${status}` };
		if (schema?.binary) {
			// ApiRoute `binary(mediaType)`: bytes, not JSON.
			responses[status].content = { [schema.binary]: { schema: { type: "string", format: "binary" } } };
		} else if (schema) {
			responses[status].content = { "application/json": { schema: responseSchema(schema) } };
		}
	}
	if (gateway) {
		responses["401"] ??= { $ref: "#/components/responses/Unauthorized" };
		responses["404"] ??= { $ref: "#/components/responses/NotFound" };
	}
	op.responses = responses;
	lines.push(`    ${method.toLowerCase()}:`, ...yaml(op, 6));
}

function operation(lines, method, path, { tag, summary, auth }) {
	lines.push(`    ${method.toLowerCase()}:`);
	lines.push(`      operationId: ${operationId(method, path)}`);
	lines.push(`      tags: [${tag}]`);
	lines.push(`      summary: ${JSON.stringify(summary)}`);
	if (!auth) lines.push("      security: []");
	const params = pathParams(path);
	if (params.length > 0) {
		lines.push("      parameters:");
		for (const name of params) {
			lines.push(`        - { name: ${name}, in: path, required: true, schema: { type: string } }`);
		}
	}
	lines.push("      responses:");
	lines.push('        "2XX": { description: Success }');
	if (auth) lines.push('        "401": { $ref: "#/components/responses/Unauthorized" }');
	lines.push('        "404": { $ref: "#/components/responses/NotFound" }');
}

function buildSpec(routesByService, publicByService) {
	const lines = [
		"# GENERATED by scripts/api-contract.mjs from the services' Express routes.",
		"# Do not edit: run `bun run api:write` after changing a route.",
		'openapi: "3.0.3"',
		"info:",
		"  title: trading-model API Gateway",
		"  description: |",
		"    Single external entry point of the platform. The gateway authenticates",
		"    the request (API key), rate limits it, then proxies",
		"    `/v{major}/{service}/{path}` to `{path}` on an instance of `{service}`",
		"    registered in discovery with that major version.",
		"",
		"    Paths and methods are read from the code. Routes mounted from a",
		"    registry entry (ADR-0021) also describe their parameters, request body",
		"    and responses from the service's Zod schemas; the others do not yet",
		"    (scripts/api-contract-known-gaps.json, `schemas`).",
		`  version: "v${API_MAJOR_VERSION}"`,
		"servers:",
		"  - url: http://localhost:8449",
		"    description: Development (compose) — edge-proxy, which forwards /v1 to the gateway over mTLS",
		"  - url: https://api.trading-model.example.com",
		"    description: Kubernetes — public API Ingress → edge-proxy",
		"security:",
		"  - ApiKeyAuth: []",
		"components:",
		"  securitySchemes:",
		"    ApiKeyAuth:",
		"      type: apiKey",
		"      in: header",
		"      name: x-api-key",
		...yaml(SECURITY_SCHEMES.SignedRequest, 4),
		"  schemas:",
		"    ErrorResponse:",
		...yaml(jsonSchema(ErrorResponse, "output"), 6),
		"  responses:",
		"    Unauthorized: { description: Missing or invalid API key }",
		"    NotFound: { description: \"Unknown route, or no registered instance of the service\" }",
		"paths:",
	];

	const gatewayRoutes = routesByService["api-gateway"].filter(isGatewayExternal);
	const entries = [
		...gatewayRoutes.map((route) => ({
			path: route.path,
			method: route.method,
			meta: { tag: "api-gateway", summary: `Handled by the gateway (${route.file})`, auth: route.path !== "/ping" },
		})),
		...PROXIED_SERVICES.flatMap((service) =>
			routesByService[service]
				.filter((route) => publicByService[service].some((pub) => routeKey(pub) === routeKey(route)))
				.map((route) => ({
					path: `/v${API_MAJOR_VERSION}/${service}${route.path}`,
					method: route.method,
					meta: route.entry
						? { tag: service, entry: route.entry, operation: route.operation }
						: { tag: service, summary: `Proxied to ${service} ${route.method} ${route.path} (${route.file})`, auth: true },
				}))
		),
	];

	const byPath = new Map();
	for (const entry of entries) {
		const key = toOpenApiPath(entry.path);
		if (!byPath.has(key)) byPath.set(key, []);
		byPath.get(key).push(entry);
	}
	for (const path of [...byPath.keys()].sort()) {
		lines.push(`  ${path}:`);
		const ops = byPath.get(path).sort((a, b) => a.method.localeCompare(b.method));
		for (const op of ops) {
			if (op.meta.entry) schemaOperation(lines, op.method, op.path, op.meta);
			else operation(lines, op.method, op.path, op.meta);
		}
	}
	return `${lines.join("\n")}\n`;
}

// ── Internal (service-to-service) specs ─────────────────────────────────────

const INTERNAL_DIR = join(ROOT, "docs/services/openapi/internal");

/** One spec per service with service-to-service routes, every route from its entry. */
function buildInternalSpecs(routesByService) {
	const specs = new Map();
	for (const [service, keys] of Object.entries(SERVICE_TO_SERVICE)) {
		const routes = routesByService[service].filter((route) => keys.includes(routeKey(route)));
		for (const route of routes) {
			if (!route.entry) {
				errors.push(
					`${service} ${routeKey(route)} (${route.file}) is a service-to-service route without a registry entry (ADR-0021)`
				);
			}
		}
		const documented = routes.filter((route) => route.entry);
		const credentials = new Set(documented.flatMap((route) => route.entry.security ?? []));
		const schemes = Object.assign({}, ...[...credentials].sort().map((credential) => SECURITY_SCHEMES[credential]));
		const lines = [
			`# GENERATED by scripts/api-contract.mjs from the registry entries of ${service}.`,
			"# Do not edit: run `bun run api:write` after changing a route.",
			'openapi: "3.0.3"',
			"info:",
			`  title: ${service} internal API`,
			"  description: |",
			`    Service-to-service routes of ${service}: the gateway does not expose them.`,
			"    Every call is mutual TLS: the caller presents its SPIFFE SVID and the",
			"    service's ACL decides which identities may call it (ADR-0011). A caller",
			"    without a valid SVID, or not allowed, gets 401/403 before these routes.",
			`  version: "v${API_MAJOR_VERSION}"`,
			"servers:",
			'  - url: "https://{host}:3000"',
			"    description: In-cluster address (compose service or Kubernetes Service), mTLS only",
			"    variables:",
			"      host:",
			`        default: ${JSON.stringify(service)}`,
			"components:",
			...(Object.keys(schemes).length > 0 ? ["  securitySchemes:", ...yaml(schemes, 4)] : []),
			"  schemas:",
			"    ErrorResponse:",
			...yaml(jsonSchema(ErrorResponse, "output"), 6),
			"paths:",
		];
		const byPath = new Map();
		for (const route of documented) {
			const key = toOpenApiPath(route.path);
			if (!byPath.has(key)) byPath.set(key, []);
			byPath.get(key).push(route);
		}
		for (const path of [...byPath.keys()].sort()) {
			lines.push(`  ${path}:`);
			for (const route of byPath.get(path).sort((a, b) => a.method.localeCompare(b.method))) {
				schemaOperation(lines, route.method, route.path, { tag: service, entry: route.entry, operation: route.operation }, false);
			}
		}
		specs.set(`${service}.yaml`, `${lines.join("\n")}\n`);
	}
	return specs;
}

// ── Gateway path resolution ──────────────────────────────────────────────────

/** Canonical names and legacy aliases the gateway resolves (registryNamesFor). */
function resolvableServiceNames() {
	const names = new Map();
	visit(parse(IDENTITY_PATH), (node) => {
		if (!ts.isVariableDeclaration(node) || !node.initializer) return;
		let init = node.initializer;
		while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) init = init.expression;
		if (node.name.getText() === "PLATFORM_SERVICES" && ts.isArrayLiteralExpression(init)) {
			for (const el of init.elements) if (ts.isStringLiteralLike(el)) names.set(el.text, el.text);
		}
		if (node.name.getText() === "LEGACY_SERVICE_NAME_ALIASES" && ts.isObjectLiteralExpression(init)) {
			for (const prop of init.properties) {
				if (ts.isPropertyAssignment(prop) && ts.isStringLiteralLike(prop.initializer)) {
					names.set(prop.name.text ?? prop.name.getText(), prop.initializer.text);
				}
			}
		}
	});
	if (names.size === 0) errors.push(`${rel(IDENTITY_PATH)}: service names not found`);
	return names;
}

/** True when a concrete path (`{param}` for unknown segments, trailing `*` for a prefix) matches a route. */
function matchesRoute(segments, routePath) {
	const routeSegments = routePath.split("/").filter(Boolean);
	if (segments.at(-1) === "*") {
		const prefix = segments.slice(0, -1);
		return routeSegments.length > prefix.length && matchesRoute(prefix, `/${routeSegments.slice(0, prefix.length).join("/")}`);
	}
	return (
		routeSegments.length === segments.length &&
		routeSegments.every(
			(seg, i) => seg.startsWith(":") || seg === segments[i] || /^(\{.*\}|:.+)$/.test(segments[i])
		)
	);
}

/** Why `method path` cannot be served by `service`, or null. `method` null: any method. */
function routeReason(service, path, method, routesByService) {
	const segments = path.split("/").filter(Boolean);
	const samePath = (routesByService[service] ?? []).filter((route) => matchesRoute(segments, route.path));
	if (samePath.length === 0) return `${service} has no route ${path}`;
	if (method && !samePath.some((route) => route.method === method)) {
		return `${service} ${path} does not accept ${method}`;
	}
	return null;
}

/** Why a gateway path (`/<service>/<route>`, after `/v1`) reaches no public route, or null. */
function gatewayReason(path, method, publicByService, serviceNames) {
	const [service, ...segments] = path.split("/").filter(Boolean);
	const canonical = serviceNames.get(service);
	if (!canonical) return `no service named "${service}" behind the gateway`;
	const reason = routeReason(canonical, `/${segments.join("/")}`, method, publicByService);
	return reason && `${reason} in PUBLIC_ROUTES`;
}

const KNOWN_GAPS = JSON.parse(readFileSync(KNOWN_GAPS_PATH, "utf8"));

/**
 * Reports the broken entries that are not known gaps, and the known gaps that
 * are fixed or gone: the list of gaps can only shrink.
 */
function applyKnownGaps(section, checked) {
	const known = new Set(Object.keys(KNOWN_GAPS[section] ?? {}));
	const seen = new Set();
	let broken = 0;
	for (const { key, where, reason } of checked) {
		seen.add(key);
		if (reason) broken += 1;
		if (reason && !known.has(key)) errors.push(`${section}: ${key} (${where}): ${reason}`);
		if (!reason && known.has(key)) {
			errors.push(`${section}: ${key} is fixed: remove it from ${rel(KNOWN_GAPS_PATH)}`);
		}
	}
	for (const key of known) {
		if (!seen.has(key)) errors.push(`${rel(KNOWN_GAPS_PATH)} lists "${key}" under ${section}, which is no longer found`);
	}
	return { checked: seen.size, broken };
}

// ── Documentation check ──────────────────────────────────────────────────────

function markdownFiles() {
	return DOC_ROOTS.flatMap((root) => {
		const path = join(ROOT, root);
		if (!statSync(path, { throwIfNoEntry: false })) return [];
		return statSync(path).isDirectory() ? walk(path, [], /\.md$/) : [path];
	}).filter((file) => !DOC_EXCLUDED.test(rel(file)));
}

const GATEWAY_URL = /(?:^|[\s`(]|:\d+)\/v(\d+)\/([a-z][a-z0-9-]*(?:\/[^\s`'")\]│?#]*)?)/gm;
const METHOD_CELL = /^`?(GET|POST|PUT|PATCH|DELETE)`?$/;
const PATH_CELL = /^`(\/[^`{]*)`$/;
const METHOD_PATH = /`(GET|POST|PUT|PATCH|DELETE) (\/[^`\s{]*)`/g;

/** `/v<n>/<service>/...` URLs anywhere in the Markdown. */
function documentedGatewayUrls(publicByService, serviceNames) {
	const checked = [];
	for (const file of markdownFiles()) {
		for (const match of readFileSync(file, "utf8").matchAll(GATEWAY_URL)) {
			const path = `/${match[2]}`;
			checked.push({
				key: `${rel(file)} /v${match[1]}${path}`,
				where: rel(file),
				reason:
					Number(match[1]) === API_MAJOR_VERSION
						? gatewayReason(path, null, publicByService, serviceNames)
						: `the gateway API is v${API_MAJOR_VERSION}`,
			});
		}
	}
	return checked;
}

/**
 * Routes of docs/services/<service>.md: `` `METHOD /path` `` mentions, and
 * table rows (first `/path` cell, optional method cell).
 */
function documentedServiceRoutes(routesByService) {
	const checked = [];
	for (const service of ["api-gateway", ...PROXIED_SERVICES]) {
		const file = join(ROOT, "docs/services", `${service}.md`);
		if (!statSync(file, { throwIfNoEntry: false })) continue;
		const text = readFileSync(file, "utf8");
		for (const [, method, path] of text.matchAll(METHOD_PATH)) {
			checked.push({
				key: `${rel(file)} ${method} ${path}`,
				where: rel(file),
				reason: routeReason(service, path, method, routesByService),
			});
		}
		for (const line of text.split("\n")) {
			if (!line.startsWith("|")) continue;
			const cells = line.split("|").map((cell) => cell.trim());
			const path = cells.map((cell) => cell.match(PATH_CELL)?.[1]).find(Boolean);
			if (!path) continue;
			const method = cells.map((cell) => cell.match(METHOD_CELL)?.[1]).find(Boolean) ?? null;
			checked.push({
				key: `${rel(file)} ${method ?? "ANY"} ${path}`,
				where: rel(file),
				reason: routeReason(service, path, method, routesByService),
			});
		}
	}
	return checked;
}

function checkDocs(routesByService, publicByService) {
	const serviceNames = resolvableServiceNames();
	return applyKnownGaps("docs", [
		...documentedGatewayUrls(publicByService, serviceNames),
		...documentedServiceRoutes(routesByService),
	]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const routesByService = Object.fromEntries(
	["api-gateway", ...PROXIED_SERVICES].map((service) => [service, extractServiceRoutes(service)])
);
checkServiceToServiceList(routesByService);
const publicByService = readPublicRoutes();
checkRouteClassification(routesByService, publicByService);

const spec = buildSpec(routesByService, publicByService);
if (process.argv.includes("--write")) {
	writeFileSync(SPEC_PATH, spec);
	console.log(`wrote ${rel(SPEC_PATH)}`);
} else if (readFileSync(SPEC_PATH, "utf8").replaceAll("\r\n", "\n") !== spec) {
	errors.push(`${rel(SPEC_PATH)} is out of date with the routes: run \`bun run api:write\``);
}

const internalSpecs = buildInternalSpecs(routesByService);
const existingInternal = existsSync(INTERNAL_DIR) ? readdirSync(INTERNAL_DIR).filter((f) => f.endsWith(".yaml")) : [];
if (process.argv.includes("--write")) {
	mkdirSync(INTERNAL_DIR, { recursive: true });
	for (const [file, spec] of internalSpecs) writeFileSync(join(INTERNAL_DIR, file), spec);
	for (const file of existingInternal) if (!internalSpecs.has(file)) rmSync(join(INTERNAL_DIR, file));
	console.log(`wrote ${internalSpecs.size} internal specs in ${rel(INTERNAL_DIR)}`);
} else {
	for (const [file, spec] of internalSpecs) {
		const path = join(INTERNAL_DIR, file);
		if (!existsSync(path) || readFileSync(path, "utf8").replaceAll("\r\n", "\n") !== spec) {
			errors.push(`${rel(path)} is out of date with the routes: run \`bun run api:write\``);
		}
	}
	for (const file of existingInternal) {
		if (!internalSpecs.has(file)) errors.push(`${rel(join(INTERNAL_DIR, file))} documents no service-to-service route: run \`bun run api:write\``);
	}
}

const docs = checkDocs(routesByService, publicByService);
const schemas = applyKnownGaps(
	"schemas",
	PROXIED_SERVICES.flatMap((service) =>
		publicByService[service].map((pub) => {
			const route = routesByService[service].find((r) => routeKey(r) === routeKey(pub));
			return {
				key: `${service} ${routeKey(pub)}`,
				where: route?.file ?? service,
				reason: route && !route.entry ? "public route without a registry entry (ADR-0021)" : null,
			};
		})
	)
);

if (errors.length > 0) {
	console.error(`API contract check failed (${errors.length}):`);
	for (const error of errors) console.error(`  ✗ ${error}`);
	process.exit(1);
}
const routeCount = Object.values(routesByService).reduce((n, routes) => n + routes.length, 0);
console.log(
	`API contract OK: ${routeCount} routes, OpenAPI up to date, ` +
		`${docs.checked} documented routes (${docs.broken} known gaps), ` +
		`${schemas.checked - schemas.broken}/${schemas.checked} public routes with schemas, ` +
		`${internalSpecs.size} internal specs`
);
