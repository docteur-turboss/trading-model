import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import { logger } from "@trading-model/http/infrastructure/logger";
import { ClientIdentity } from "@trading-model/primitives/primitives/auth-ids";
import type { RequestHandler } from "express";

import { ENV } from "../../infrastructure/config/env";
import { AUTH_FAILURES_TOTAL } from "../../infrastructure/config/metrics";

interface AuthRequest {
	clientIdentity: ClientIdentity;
}

function getValidTokens(): Set<string> {
	return new Set(parseCommaSeparated(ENV.AUTH_TOKENS));
}

export const AUTH_MIDDLEWARE: RequestHandler = catchSync((req, _res, next) => {
	const tokenHeader = ENV.AUTH_TOKEN_HEADER.toLowerCase();
	const token = req.headers[tokenHeader] ?? req.headers.authorization;

	if (!token || typeof token !== "string") {
		AUTH_FAILURES_TOTAL.inc();
		return sendResponse(
			{ error: "Missing authentication token" },
			401 as HttpStatusCode
		);
	}

	const validTokens = getValidTokens();
	if (validTokens.size === 0) {
		if (ENV.AUTH_STRICT) {
			AUTH_FAILURES_TOTAL.inc();
			return sendResponse(
				{ error: "Server misconfiguration: no valid tokens configured" },
				503 as HttpStatusCode
			);
		}
		logger.warn("AUTH_TOKENS is empty — accepting any token (non-strict mode)");
	} else if (!validTokens.has(token)) {
		AUTH_FAILURES_TOTAL.inc();
		return sendResponse(
			{ error: "Invalid authentication token" },
			401 as HttpStatusCode
		);
	}

	(req as unknown as AuthRequest).clientIdentity = ClientIdentity.of(
		`client:${token.slice(0, 8)}`
	);
	next();
});
