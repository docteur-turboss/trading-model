import { anonymizeIp } from "@trading-model/common/utils/anonymize-ip";
import { normalizeServiceName } from "@trading-model/common/utils/spiffe";
import { resolveMtlsIdentity } from "@trading-model/http/adapters/inbound/mtls-identity";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { RequestHandler } from "express";

/**
 * Identity-bound authentication for the registration endpoint (ADR-0011).
 * The caller's attested SPIFFE identity must name the service it registers:
 * a workload can only register instances of itself, so no shared secret is
 * needed. Legacy service names (e.g. `financial-scraper-service`) are
 * normalized before the comparison.
 */
export const REGISTRATION_MTLS_AUTH: RequestHandler = (req, res, next) => {
	const result = resolveMtlsIdentity(req);
	if (!result) {
		logger.warn("Registration rejected: mTLS identity missing", {
			context: { ip: anonymizeIp(req.ip) },
		});
		res.status(401).json({
			error: "Client certificate required for registration",
		});
		return;
	}
	const callerService = normalizeServiceName(result.serviceName);
	const requested = (req.body as { serviceName?: unknown } | undefined)
		?.serviceName;
	if (
		typeof requested !== "string" ||
		normalizeServiceName(requested) !== callerService
	) {
		logger.warn("Registration rejected: identity does not match serviceName", {
			context: {
				callerService: callerService.toString(),
				requestedService: typeof requested === "string" ? requested : null,
			},
		});
		res.status(403).json({
			error: "Caller identity does not match the registered serviceName",
		});
		return;
	}
	logger.info("Registration mTLS identity verified", {
		context: {
			callerService: callerService.toString(),
			identity: result.identity,
		},
	});
	next();
};
