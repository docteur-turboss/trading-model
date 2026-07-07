import type { Request } from "express";

import type { ServiceId } from "../domain/primitives";
import { AclService } from "./acl-service";
import { catchSync } from "./catch-error";

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
	targetService: string,
	allowedCallers?: ServiceId[]
) {
	const acl = new AclService();
	return catchSync((req: Request, _res, next) => {
		const callerName = acl.resolveCallerName(req);
		acl.authorizeCaller(callerName, targetService, allowedCallers);
		next();
	});
}
