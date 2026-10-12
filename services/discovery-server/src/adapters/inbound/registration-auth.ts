import { anonymizeIp } from "@trading-model/common/utils/anonymize-ip";
import { resolveMtlsIdentity } from "@trading-model/http/adapters/inbound/mtls-identity";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { RequestHandler } from "express";
import { ENV } from "../../infrastructure/config/env";

/**
 * mTLS authentication middleware for the registration endpoint.
 * Defense-in-depth: verifies the client presented a valid mTLS certificate
 * even though the transport layer already enforces mTLS.
 */
export const REGISTRATION_MTLS_AUTH: RequestHandler = (req, _res, next) => {
	const result = resolveMtlsIdentity(req);
	if (!result) {
		logger.warn("Registration rejected: mTLS identity missing", {
			context: { ip: anonymizeIp(req.ip) },
		});
		_res.status(401).json({
			error: "Client certificate required for registration",
		});
		return;
	}
	logger.info("Registration mTLS identity verified", {
		context: {
			callerService: result.serviceName.toString(),
			identity: result.identity,
		},
	});
	next();
};

/**
 * Token-based authentication middleware for the registration endpoint.
 * In production, REGISTRATION_TOKEN is mandatory (enforced by env schema).
 * In non-production, registration is open when no token is configured.
 */
export const REGISTRATION_AUTH: RequestHandler = (req, _res, next) => {
	if (!ENV.REGISTRATION_TOKEN) {
		if (ENV.NODE_ENV === "production") {
			logger.error(
				"Registration rejected: REGISTRATION_TOKEN not configured in production"
			);
			_res.status(503).json({
				error:
					"Server misconfiguration: REGISTRATION_TOKEN must be set in production",
			});
			return;
		}
		logger.warn(
			"Registration token check disabled — REGISTRATION_TOKEN not set (non-production)"
		);
		next();
		return;
	}
	const token = req.headers["x-registration-token"];
	if (typeof token !== "string" || token !== ENV.REGISTRATION_TOKEN) {
		logger.warn(
			"Registration rejected: invalid or missing registration token",
			{
				context: { ip: anonymizeIp(req.ip) },
			}
		);
		_res.status(401).json({ error: "Invalid registration token" });
		return;
	}
	next();
};
