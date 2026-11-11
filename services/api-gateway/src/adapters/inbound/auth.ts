import { createHash, timingSafeEqual } from "node:crypto";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import { logger } from "@trading-model/http/infrastructure/logger";
import { ClientIdentity } from "@trading-model/primitives/primitives/auth-ids";
import type { Request, RequestHandler } from "express";

import { ENV } from "../../infrastructure/config/env";
import { AUTH_FAILURES_TOTAL } from "../../infrastructure/config/metrics";
import {
	API_SCOPES,
	type ApiKey,
	type ApiScope,
	parseApiKey,
} from "../../shared/api-keys";

/** What AUTH_MIDDLEWARE sets on an authenticated request. */
export interface AuthenticatedRequest {
	clientIdentity: ClientIdentity;
	/** Name of the API key (ADR-0059), null in non-strict mode without keys. */
	apiKeyName: string | null;
	apiKeyScopes: readonly ApiScope[];
}

let parsedFrom: string | undefined;
const sha256 = (value: string): Buffer =>
	createHash("sha256").update(value).digest();

/** A key with the sha256 of its secret, computed once per AUTH_TOKENS value. */
type HashedKey = ApiKey & { digest: Buffer };
let parsedKeys: HashedKey[] = [];

/** The valid keys of AUTH_TOKENS, parsed again only when it changes. */
function getValidKeys(): HashedKey[] {
	if (parsedFrom !== ENV.AUTH_TOKENS) {
		parsedFrom = ENV.AUTH_TOKENS;
		parsedKeys = parseCommaSeparated(ENV.AUTH_TOKENS)
			.map(parseApiKey)
			// The env schema refuses a malformed entry at startup: none is left here.
			.filter((key): key is ApiKey => "secret" in key)
			.map((key) => ({ ...key, digest: sha256(key.secret) }));
		for (const key of parsedKeys.filter((candidate) => candidate.legacy)) {
			logger.warn(
				`AUTH_TOKENS: "${key.name}" uses the old format (bare secret), granted every scope; rewrite it as name:scopes:secret before the next release (ADR-0059)`
			);
		}
	}
	return parsedKeys;
}

/** Fixed-length digests compared in constant time; no early exit on a match. */
function findKey(digest: Buffer, keys: HashedKey[]): ApiKey | undefined {
	let found: ApiKey | undefined;
	for (const key of keys) {
		if (timingSafeEqual(digest, key.digest) && !found) {
			found = key;
		}
	}
	return found;
}

/** The scopes and key name AUTH_MIDDLEWARE set on the request. */
export function authOf(req: Request): AuthenticatedRequest {
	// as unknown as: Express request widened after the auth middleware set its fields
	return req as unknown as AuthenticatedRequest;
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
			HTTP_STATUS.UNAUTHORIZED
		);
	}

	const digest = sha256(token);
	const validKeys = getValidKeys();
	let key: ApiKey | undefined;
	if (validKeys.length === 0) {
		if (ENV.AUTH_STRICT) {
			AUTH_FAILURES_TOTAL.inc();
			return sendResponse(
				{ error: "Server misconfiguration: no valid tokens configured" },
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		logger.warn("AUTH_TOKENS is empty — accepting any token (non-strict mode)");
	} else {
		key = findKey(digest, validKeys);
		if (!key) {
			AUTH_FAILURES_TOTAL.inc();
			return sendResponse(
				{ error: "Invalid authentication token" },
				HTTP_STATUS.UNAUTHORIZED
			);
		}
	}

	const auth = authOf(req);
	auth.clientIdentity = ClientIdentity.of(
		`client:${digest.toString("hex").slice(0, 32)}`
	);
	auth.apiKeyName = key?.name ?? null;
	auth.apiKeyScopes = key?.scopes ?? API_SCOPES;
	next();
});
