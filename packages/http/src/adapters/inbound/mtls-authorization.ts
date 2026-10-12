import type { ServiceId } from "@trading-model/common/domain/primitives";
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
 * router.use('/admin', MTLSAuthorizationMiddleware('admin-service', ['admin-interface']));
 * ```
 */
export function MTLSAuthorizationMiddleware(
	targetService: ServiceId,
	allowedCallers?: ServiceId[]
) {
	const acl = new AclService();
	return catchSync((req: Request, _res, next) => {
		const callerName = acl.resolveCallerName(req);
		acl.authorizeCaller(callerName, targetService, allowedCallers);
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
