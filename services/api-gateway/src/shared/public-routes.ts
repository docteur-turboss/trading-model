import { normalizeServiceName } from "@trading-model/common/utils/spiffe";

/**
 * Routes the gateway exposes, as `METHOD /v<major>/<service>/<path>` with
 * Express `:param` segments (service by canonical name). A service lists one
 * entry per major it serves; an old major leaves this list one release after
 * its successor shipped (ADR-0072). Every other route is refused
 * before resolution: the gateway calls services with its own SVID, so
 * proxying a service-to-service route (discovery `/register`, message-manager
 * `/message`...) would lend its identity to any API client.
 *
 * `scripts/api-contract.mjs` generates the OpenAPI from this list and fails
 * when an entry reaches no route or a service route is left unclassified.
 */
export const PUBLIC_ROUTES = [
	"GET /v1/audit-logger/events",
	"GET /v1/audit-logger/events/stats",
	"GET /v1/audit-logger/events/:messageId",
	"GET /v1/dlq-service/dlq",
	"DELETE /v1/dlq-service/dlq",
	// Deprecated in release N, removed with discovery-server in N+1 (ADR-0072).
	"GET /v1/discovery-server/services",
	"GET /v1/discovery-server/services/:serviceName",
	"GET /v1/discovery-server/services/:serviceName/:instanceId",
	"POST /v1/dlq-service/dlq/replay",
	// Scope risk:admin; the API key name is the actor (ADR-0059, ADR-0064 §5).
	"POST /v1/risk-execution/admin/kill-switch",
	"POST /v1/risk-execution/admin/kill-switch/rearm",
	"GET /v2/financial-scraper/candles/symbols/:symbol",
	"GET /v2/financial-scraper/candles/timestamp/:timestamp",
	"GET /v2/financial-scraper/signals/assets",
	"GET /v2/financial-scraper/signals/assets/:assetId",
	"GET /v2/financial-scraper/signals/sources",
	"GET /v2/financial-scraper/ticker/symbols/:symbol",
	"GET /v2/financial-scraper/ticker/timestamp/:timestamp",
	"GET /v2/financial-scraper/trade/symbols/:symbol",
	"GET /v2/financial-scraper/trade/timestamp/:timestamp",
	"GET /v1/trader-trainer/best-agent",
	"GET /v1/trader-trainer/models/:symbol",
	"GET /v1/trader-trainer/models/:symbol/:version",
	"GET /v1/trader-trainer/training-agents",
	"GET /v1/trader-trainer/training-agents/:symbol",
	"GET /v1/trader-trainer/training-status",
] as const;

interface RoutePattern {
	method: string;
	path: string;
	segments: string[];
}

const PATTERNS: readonly RoutePattern[] = PUBLIC_ROUTES.map((route) => {
	const [method, path] = route.split(" ");
	return { method, path, segments: path.split("/").slice(1) };
});

function matches(pattern: RoutePattern, segments: string[]): boolean {
	return (
		pattern.segments.length === segments.length &&
		pattern.segments.every((expected, index) =>
			expected.startsWith(":")
				? segments[index] !== ""
				: expected === segments[index]
		)
	);
}

/**
 * The `PUBLIC_ROUTES` pattern (`/v1/audit-logger/events/:messageId`) that
 * `method /v<major>/<service><path>` matches, or undefined when it is not a
 * public route. The path must already be in normal form: the proxy resolves
 * it with `new URL`, which would turn `/services/../register` (or `%2e%2e`,
 * `\`) into another route than the one matched here.
 */
export function matchPublicRoute(
	method: string,
	majorVersion: number,
	serviceName: string,
	path: string
): string | undefined {
	if (new URL(path, "https://gateway.invalid").pathname !== path) {
		return undefined;
	}
	const segments = [
		`v${majorVersion}`,
		String(normalizeServiceName(serviceName)),
		...path.split("/").slice(1),
	];
	return PATTERNS.find(
		(pattern) => pattern.method === method && matches(pattern, segments)
	)?.path;
}
