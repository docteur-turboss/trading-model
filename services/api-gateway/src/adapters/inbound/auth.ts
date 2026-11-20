import { createHash, timingSafeEqual } from "node:crypto";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { catchSync } from "@trading-model/http/catch-error";
import { sendResponse } from "@trading-model/http/response-exception";
import { ClientIdentity } from "@trading-model/primitives/primitives/auth-ids";
import type { Request, RequestHandler } from "express";

import type { Env } from "../../infrastructure/config/env";
import { AUTH_FAILURES_TOTAL } from "../../infrastructure/config/metrics";
import { type ApiKey, type ApiScope, parseApiKey } from "../../shared/api-keys";

/** What the auth middleware sets on an authenticated request. */
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
function getValidKeys(authTokens: string): HashedKey[] {
	if (parsedFrom !== authTokens) {
		parsedFrom = authTokens;
		parsedKeys = parseCommaSeparated(authTokens)
			.map(parseApiKey)
			// The env schema refuses a malformed entry at startup: none is left here.
			.filter((key): key is ApiKey => "secret" in key)
			.map((key) => ({ ...key, digest: sha256(key.secret) }));
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

/** The scopes and key name the auth middleware set on the request. */
export function authOf(req: Request): AuthenticatedRequest {
	// as unknown as: Express request widened after the auth middleware set its fields
	return req as unknown as AuthenticatedRequest;
}

/** Settings the auth middleware reads, passed by the composition root. */
export type AuthSettings = Pick<Env, "AUTH_TOKENS" | "AUTH_TOKEN_HEADER">;

/** The token the caller presented, `<token>` or `Bearer <token>`, if any. */
export function presentedToken(
	req: Request,
	env: Pick<Env, "AUTH_TOKEN_HEADER">
): string | undefined {
	const raw =
		req.headers[env.AUTH_TOKEN_HEADER.toLowerCase()] ??
		req.headers.authorization;
	// The scheme is case-insensitive.
	return typeof raw === "string" ? raw.replace(/^Bearer\s+/i, "") : undefined;
}

/** One identity per token, no token material: `client:` + 32 hex of its sha256. */
export const clientIdentityOf = (token: string): string =>
	`client:${sha256(token).toString("hex").slice(0, 32)}`;

export const createAuthMiddleware = (env: AuthSettings): RequestHandler =>
	catchSync((req, _res, next) => {
		const token = presentedToken(req, env);

		if (!token) {
			AUTH_FAILURES_TOTAL.inc();
			return sendResponse(
				{ error: "Missing authentication token" },
				HTTP_STATUS.UNAUTHORIZED
			);
		}

		const digest = sha256(token);
		const validKeys = getValidKeys(env.AUTH_TOKENS);
		if (validKeys.length === 0) {
			AUTH_FAILURES_TOTAL.inc();
			return sendResponse(
				{ error: "Server misconfiguration: no valid tokens configured" },
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		const key = findKey(digest, validKeys);
		if (!key) {
			AUTH_FAILURES_TOTAL.inc();
			return sendResponse(
				{ error: "Invalid authentication token" },
				HTTP_STATUS.UNAUTHORIZED
			);
		}

		const auth = authOf(req);
		auth.clientIdentity = ClientIdentity.of(clientIdentityOf(token));
		auth.apiKeyName = key.name;
		auth.apiKeyScopes = key.scopes;
		next();
	});
