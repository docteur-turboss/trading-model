import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";

import { ENV } from "../config/env";

export interface AuthRequest {
	clientIdentity: string;
}

function getValidTokens(): Set<string> {
	return new Set(
		ENV.AUTH_TOKENS.split(",")
			.map((part) => part.trim())
			.filter((part) => part.length > 0)
	);
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

	(req as unknown as AuthRequest).clientIdentity =
		`client:${token.slice(0, 8)}`;
});
