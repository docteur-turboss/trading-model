import { normalizeServiceName } from "@trading-model/common/utils/spiffe";

/**
 * Routes the gateway exposes, as `METHOD /<service>/<path>` with Express
 * `:param` segments (service by canonical name). Every other route is refused
 * before resolution: the gateway calls services with its own SVID, so
 * proxying a service-to-service route (discovery `/register`, message-manager
 * `/message`...) would lend its identity to any API client.
 *
 * `scripts/api-contract.mjs` generates the OpenAPI from this list and fails
 * when an entry reaches no route or a service route is left unclassified.
 */
export const PUBLIC_ROUTES = [
	"GET /audit-logger/events",
	"GET /audit-logger/events/stats",
	"GET /audit-logger/events/:messageId",
	"GET /discovery-server/services",
	"GET /discovery-server/services/:serviceName",
	"GET /discovery-server/services/:serviceName/:instanceId",
	"GET /dlq-service/dlq",
	"POST /dlq-service/dlq",
	"DELETE /dlq-service/dlq",
	"POST /dlq-service/dlq/replay",
	"GET /financial-scraper/candles/sources/:source",
	"GET /financial-scraper/candles/symbols/:symbol",
	"GET /financial-scraper/candles/timestamp/:timestamp",
	"GET /financial-scraper/orderbook/after/timestamp/:timestamp",
	"GET /financial-scraper/orderbook/before/timestamp/:timestamp",
	"GET /financial-scraper/orderbook/sources/:source",
	"GET /financial-scraper/orderbook/symbols/:symbol",
	"GET /financial-scraper/ticker/sources/:source",
	"GET /financial-scraper/ticker/symbols/:symbol",
	"GET /financial-scraper/ticker/timestamp/:timestamp",
	"GET /financial-scraper/trade/sources/:source",
	"GET /financial-scraper/trade/symbols/:symbol",
	"GET /financial-scraper/trade/timestamp/:timestamp",
	"GET /trader-trainer/best-agent",
	"GET /trader-trainer/models/:symbol",
	"GET /trader-trainer/models/:symbol/:version",
	"GET /trader-trainer/training-agents",
	"GET /trader-trainer/training-agents/:symbol",
	"GET /trader-trainer/training-status",
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
 * True when `method /<service><path>` is a public route. The path must already
 * be in normal form: the proxy resolves it with `new URL`, which would turn
 * `/services/../register` (or `%2e%2e`, `\`) into another route than the one
 * matched here.
 */
export function isPublicRoute(
	method: string,
	serviceName: string,
	path: string
): boolean {
	if (new URL(path, "https://gateway.invalid").pathname !== path) {
		return false;
	}
	const segments = [
		String(normalizeServiceName(serviceName)),
		...path.split("/").slice(1),
	];
	return PATTERNS.some(
		(pattern) => pattern.method === method && matches(pattern, segments)
	);
}
