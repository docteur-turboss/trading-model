import type { ServiceId } from "@trading-model/primitives/primitives";
import type { Request } from "express";
import { AclService } from "./acl-service";
import { catchSync } from "./catch-error";
import { isCallerAuthorized, resolveMtlsIdentity } from "./mtls-identity";

export { DEFAULT_ACL } from "./acl-config";

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

export interface WsAuthResult {
	authorized: boolean;
	reason?: string;
	rejectCode?: number;
}

/**
 * Verify mTLS authentication and ACL authorization for a WebSocket upgrade
 * request. Returns a result object instead of throwing, suitable for the
 * `verifyClient` callback in the `ws` library.
 *
 * @param req - The incoming HTTP upgrade request
 * @param targetService - The service this WebSocket server belongs to
 * @param allowedCallers - Optional explicit allowlist (falls back to DEFAULT_ACL)
 */
export function verifyWsAuthorization(
	req: import("node:http").IncomingMessage,
	targetService: ServiceId,
	allowedCallers?: readonly ServiceId[]
): WsAuthResult {
	const identity = resolveMtlsIdentity(req);
	if (!identity) {
		return {
			authorized: false,
			reason: "mTLS client certificate required",
			rejectCode: 401,
		};
	}

	const authorized = isCallerAuthorized(
		identity.serviceName,
		targetService,
		undefined,
		allowedCallers
	);
	if (!authorized) {
		return {
			authorized: false,
			reason: `"${identity.serviceName}" is not authorized to access "${targetService}"`,
			rejectCode: 403,
		};
	}

	return { authorized: true };
}
