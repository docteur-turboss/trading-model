import type { Request } from "express";

import type { ServiceId } from "../domain/primitives";
import { catchSync } from "./catch-error";
import { ResponseException } from "./response-exception";

/**
 * Default ACL: target service name → list of allowed caller service names.
 * '*' means any authenticated service is allowed.
 */
function svc(s: string): ServiceId { return s as ServiceId; }

const DEFAULT_ACL: Record<string, readonly ServiceId[]> = {
	"certificate-authority": [svc("*")],
	"discovery-server": [svc("*")],
	"audit-logger": [svc("*")],
	"message-manager": [
		svc("discovery-server"),
		svc("financial-scraper"),
		svc("trader-trainer"),
		svc("api-gateway"),
	],
	"financial-scraper": [svc("api-gateway")],
	"trader-trainer": [svc("api-gateway"), svc("financial-scraper"), svc("discovery-server")],
	"api-gateway": [svc("admin-interface")],
};

function extractServiceName(clientIdentity: string): string | null {
	if (clientIdentity.startsWith("spiffe://")) {
		const parts = clientIdentity.split("/");
		return parts[parts.length - 1] || null;
	}
	if (clientIdentity.startsWith("client:")) {
		return "api-gateway";
	}
	return clientIdentity || null;
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
 * router.use('/admin', MTLSAuthorizationMiddleware('admin-service', ['admin-interface']));
 * ```
 */
export function MTLSAuthorizationMiddleware(
	targetService: string,
	allowedCallers?: ServiceId[]
) {
	return catchSync((req: Request, _res, next) => {
		const callerName = _resolveCallerName(req);
		_authorizeCaller(callerName, targetService, allowedCallers);
		next();
	});
}

function _throwUnauthorized(message: string): never {
	throw ResponseException(JSON.stringify({ error: message })).unauthorized();
}

function _throwForbidden(reason: string): never {
	throw ResponseException(
		JSON.stringify({ error: "Forbidden", reason })
	).forbidden();
}

function _resolveCallerName(req: Request): string {
	const callerIdentity = req.clientIdentity;
	if (!callerIdentity) {
		_throwUnauthorized("Unauthenticated");
	}
	const callerName = extractServiceName(callerIdentity);
	if (!callerName) {
		_throwForbidden("Could not resolve caller identity");
	}
	return callerName;
}

function _getAllowedCallers(
	targetService: string,
	allowedCallers?: readonly ServiceId[],
): readonly ServiceId[] {
	const allowed = allowedCallers ?? DEFAULT_ACL[targetService];
	if (!allowed) {
		_throwForbidden(`No authorization policy for "${targetService}"`);
	}
	return allowed;
}

function _authorizeCaller(
	callerName: string,
	targetService: string,
	allowedCallers?: readonly ServiceId[],
): void {
	const allowed = _getAllowedCallers(targetService, allowedCallers);
	if (!(allowed.includes("*" as ServiceId) || allowed.includes(callerName as ServiceId))) {
		_throwForbidden(
			`"${callerName}" is not authorized to access "${targetService}"`
		);
	}
}
