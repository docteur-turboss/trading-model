import type { ServiceId } from "@trading-model/primitives/primitives";
import type { Request } from "express";
import { AclService } from "./acl-service";
import { catchSync } from "./catch-error";

export { DEFAULT_ACL } from "./acl-config";

/** Identities allowed to read every service's metrics, and nothing else. */
const METRICS_SCRAPERS: readonly string[] = ["prometheus"];
const METRICS_PATH = "/metrics";

/**
 * Prometheus scrapes `GET /metrics` on every service with its own SVID: it is
 * not a caller of their APIs, so it gets this route only, not an ACL entry.
 * A service also reads its own metrics (the canary gate of deploy-k8s.sh
 * curls them from inside the canary pod, with the pod's SVID).
 */
function isMetricsScrape(
	req: Request,
	callerName: ServiceId,
	targetService: ServiceId
): boolean {
	return (
		req.method === "GET" &&
		req.path === METRICS_PATH &&
		(METRICS_SCRAPERS.includes(String(callerName)) ||
			String(callerName) === String(targetService))
	);
}

/**
 * Authorization middleware for mTLS-based service-to-service calls.
 *
 * Checks that the caller (identified via `req.clientIdentity`) is
 * listed in the ACL for the given target service.
 *
 * Usage:
 * ```
 * // Per-service allowlist
 * app.use(MTLSAuthorizationMiddleware('message-manager'));
 *
 * // Or custom allowlist for specific routes
 * router.use('/admin', MTLSAuthorizationMiddleware('admin-service', ['edge-proxy']));
 * ```
 */
export function MTLSAuthorizationMiddleware(
	targetService: ServiceId,
	allowedCallers?: ServiceId[]
) {
	const acl = new AclService();
	return catchSync((req: Request, _res, next) => {
		const callerName = acl.resolveCallerName(req);
		if (!isMetricsScrape(req, callerName, targetService)) {
			acl.authorizeCaller(callerName, targetService, allowedCallers);
		}
		next();
	});
}
