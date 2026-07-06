import type { Request } from "express";

import { catchSync } from "./catch-error";
import { ResponseException } from "./response-exception";

/**
 * Default ACL: target service name → list of allowed caller service names.
 * '*' means any authenticated service is allowed.
 */
const DEFAULT_ACL: Record<string, string[]> = {
	"certificate-authority": ["*"],
	"discovery-server": ["*"],
	"audit-logger": ["*"],
	"message-manager": [
		"discovery-server",
		"financial-scraper",
		"trader-trainer",
		"api-gateway",
	],
	"financial-scraper": ["api-gateway"],
	"trader-trainer": ["api-gateway", "financial-scraper", "discovery-server"],
	"api-gateway": ["admin-interface"],
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
	allowedCallers?: string[]
) {
	return catchSync((req: Request, _res, next) => {
		const callerName = _resolveCallerName(req);
		_authorizeCaller(callerName, targetService, allowedCallers);
		next();
	});
}

function _resolveCallerName(req: Request): string {
	const callerIdentity = req.clientIdentity;
	if (!callerIdentity) {
		throw ResponseException(
			JSON.stringify({ error: "Unauthenticated" })
		).unauthorized();
	}

	const callerName = extractServiceName(callerIdentity);
	if (!callerName) {
		throw ResponseException(
			JSON.stringify({ error: "Could not resolve caller identity" })
		).forbidden();
	}

	return callerName;
}

function _authorizeCaller(
	callerName: string,
	targetService: string,
	allowedCallers?: string[]
): void {
	const allowed = allowedCallers ?? DEFAULT_ACL[targetService];

	if (!allowed) {
		throw ResponseException(
			JSON.stringify({
				error: "Forbidden",
				reason: `No authorization policy for "${targetService}"`,
			})
		).forbidden();
	}

	if (!(allowed.includes("*") || allowed.includes(callerName))) {
		throw ResponseException(
			JSON.stringify({
				error: "Forbidden",
				reason: `"${callerName}" is not authorized to access "${targetService}"`,
			})
		).forbidden();
	}
}
