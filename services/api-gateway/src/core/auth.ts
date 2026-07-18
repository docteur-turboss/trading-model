import { ClientIdentity } from "@trading-model/common/domain/primitives/auth-ids";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import type { RequestHandler } from "express";

import { ENV } from "../config/env";

export interface AuthRequest {
	clientIdentity: ClientIdentity;
}

function getValidTokens(): Set<string> {
	return new Set(parseCommaSeparated(ENV.AUTH_TOKENS));
}

export const AUTH_MIDDLEWARE: RequestHandler = catchSync((req) => {
	const tokenHeader = ENV.AUTH_TOKEN_HEADER.toLowerCase();
	const token = req.headers[tokenHeader] ?? req.headers.authorization;

	if (!token || typeof token !== "string") {
		return sendResponse({ error: "Missing authentication token" }, 401);
	}

	const validTokens = getValidTokens();
	if (validTokens.size > 0 && !validTokens.has(token)) {
		return sendResponse({ error: "Invalid authentication token" }, 401);
	}

	(req as unknown as AuthRequest).clientIdentity = ClientIdentity.of(
		`client:${token.slice(0, 8)}`
	);
});
