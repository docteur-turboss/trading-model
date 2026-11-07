import { createHash, timingSafeEqual } from "node:crypto";

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

function getValidTokens(): string[] {
	return parseCommaSeparated(ENV.AUTH_TOKENS);
}

const sha256 = (value: string): Buffer =>
	createHash("sha256").update(value).digest();

/** Fixed-length digests compared in constant time; no early exit on a match. */
function isValidToken(token: string, validTokens: string[]): boolean {
	const digest = sha256(token);
	let ok = false;
	for (const valid of validTokens) {
		ok = timingSafeEqual(digest, sha256(valid)) || ok;
	}
	return ok;
}

export const AUTH_MIDDLEWARE: RequestHandler = catchSync((req, _res, next) => {
	const tokenHeader = ENV.AUTH_TOKEN_HEADER.toLowerCase();
	const raw = req.headers[tokenHeader] ?? req.headers.authorization;
	// Accept both `<token>` and `Bearer <token>` (scheme is case-insensitive).
	const token = typeof raw === "string" ? raw.replace(/^Bearer\s+/i, "") : raw;

	if (!token || typeof token !== "string") {
		AUTH_FAILURES_TOTAL.inc();
		return sendResponse(
			{ error: "Missing authentication token" },
			401 as HttpStatusCode
		);
	}

	const validTokens = getValidTokens();
	if (validTokens.length === 0) {
		if (ENV.AUTH_STRICT) {
			AUTH_FAILURES_TOTAL.inc();
			return sendResponse(
				{ error: "Server misconfiguration: no valid tokens configured" },
				503 as HttpStatusCode
			);
		}
		logger.warn("AUTH_TOKENS is empty — accepting any token (non-strict mode)");
	} else if (!isValidToken(token, validTokens)) {
		AUTH_FAILURES_TOTAL.inc();
		return sendResponse(
			{ error: "Invalid authentication token" },
			401 as HttpStatusCode
		);
	}

	(req as unknown as AuthRequest).clientIdentity = ClientIdentity.of(
		`client:${sha256(token).toString("hex").slice(0, 32)}`
	);
	next();
});
