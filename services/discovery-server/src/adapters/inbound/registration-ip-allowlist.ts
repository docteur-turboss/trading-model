import { anonymizeIp } from "@trading-model/common/utils/anonymize-ip";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	isAllowedProxyIP,
	parseCIDRList,
} from "@trading-model/primitives/primitives";
import type { RequestHandler } from "express";
import { ENV } from "../../infrastructure/config/env";

const ALLOWED_RANGES = parseCIDRList(ENV.ALLOWED_REGISTRATION_CIDRS);

export const REGISTRATION_IP_ALLOWLIST: RequestHandler = (req, _res, next) => {
	if (ALLOWED_RANGES.length === 0) {
		if (ENV.NODE_ENV === "production") {
			logger.error(
				"Registration rejected: ALLOWED_REGISTRATION_CIDRS is empty in production"
			);
			_res.status(503).json({
				error:
					"Server misconfiguration: ALLOWED_REGISTRATION_CIDRS must not be empty in production",
			});
			return;
		}
		logger.warn(
			"Registration IP check disabled — ALLOWED_REGISTRATION_CIDRS is empty (non-production)"
		);
		next();
		return;
	}
	const ip = req.ip ?? req.socket.remoteAddress;
	if (!ip) {
		logger.warn("Registration rejected: unable to determine client IP");
		_res.status(400).json({ error: "Unable to determine client IP" });
		return;
	}
	const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
	if (!isAllowedProxyIP(normalized, ALLOWED_RANGES)) {
		logger.warn("Registration rejected: client IP not in allowed CIDR ranges", {
			context: { ip: anonymizeIp(normalized) },
		});
		_res.status(403).json({ error: "Registration not allowed from this IP" });
		return;
	}
	next();
};
