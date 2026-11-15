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
	"POST /v1/dlq-service/dlq/replay",
	"GET /v2/financial-scraper/candles/sources/:source",
	"GET /v2/financial-scraper/candles/symbols/:symbol",
	"GET /v2/financial-scraper/candles/timestamp/:timestamp",
	"GET /v2/financial-scraper/signals/assets/:assetId",
	"GET /v2/financial-scraper/ticker/sources/:source",
	"GET /v2/financial-scraper/ticker/symbols/:symbol",
	"GET /v2/financial-scraper/ticker/timestamp/:timestamp",
	"GET /v2/financial-scraper/trade/sources/:source",
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
	segments: string[];
}

const PATTERNS: readonly RoutePattern[] = PUBLIC_ROUTES.map((route) => {
	const [method, path] = route.split(" ");
	return { method, segments: path.split("/").slice(1) };
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
 * True when `method /v<major>/<service><path>` is a public route. The path must already
 * be in normal form: the proxy resolves it with `new URL`, which would turn
 * `/services/../register` (or `%2e%2e`, `\`) into another route than the one
 * matched here.
 */
export function isPublicRoute(
	method: string,
	majorVersion: number,
	serviceName: string,
	path: string
): boolean {
	if (new URL(path, "https://gateway.invalid").pathname !== path) {
		return false;
	}
	const segments = [
		`v${majorVersion}`,
		String(normalizeServiceName(serviceName)),
		...path.split("/").slice(1),
	];
	return PATTERNS.some(
		(pattern) => pattern.method === method && matches(pattern, segments)
	);
}
