import { logger } from "@trading-model/common/config/logger";

const UNAUTH_SIGN_ATTEMPTS = new Map<
	string,
	{ count: number; resetAt: number }
>();
const UNAUTH_RATE_LIMIT = 3;
const UNAUTH_WINDOW_MS = 60_000;
const UNAUTH_BAN_MS = 300_000;
const UNAUTH_CLEANUP_MS = 60_000;

setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of UNAUTH_SIGN_ATTEMPTS) {
		if (now > entry.resetAt + UNAUTH_BAN_MS) {
			UNAUTH_SIGN_ATTEMPTS.delete(key);
		}
	}
}, UNAUTH_CLEANUP_MS).unref();

export function checkUnauthRateLimit(clientIdentity: string): boolean {
	const now = Date.now();
	const entry = UNAUTH_SIGN_ATTEMPTS.get(clientIdentity);
	if (!entry || now > entry.resetAt) {
		UNAUTH_SIGN_ATTEMPTS.set(clientIdentity, {
			count: 1,
			resetAt: now + UNAUTH_WINDOW_MS,
		});
		return true;
	}
	if (entry.count >= UNAUTH_RATE_LIMIT) {
		if (now > entry.resetAt + UNAUTH_BAN_MS) {
			UNAUTH_SIGN_ATTEMPTS.set(clientIdentity, {
				count: 1,
				resetAt: now + UNAUTH_WINDOW_MS,
			});
			return true;
		}
		return false;
	}
	entry.count++;
	return true;
}

const AUTH_RATE_LIMIT_MAX = 100;
const AUTH_RATE_LIMIT_MS = 60_000;

export interface ConnectionState {
	tokenProvided: boolean;
	bootstrapToken: string | undefined;
	authAttempts: number;
	requestCount: number;
	requestWindowStart: number;
}

export function checkSignRequestRateLimit(
	connectionState: ConnectionState,
	clientIdentity: string | undefined,
	limiterKey: string
): boolean {
	if (!(connectionState.tokenProvided || checkUnauthRateLimit(limiterKey))) {
		return false;
	}

	const elapsed = Date.now() - connectionState.requestWindowStart;
	if (elapsed > AUTH_RATE_LIMIT_MS) {
		connectionState.requestCount = 1;
		connectionState.requestWindowStart = Date.now();
	} else {
		connectionState.requestCount++;
		if (connectionState.requestCount > AUTH_RATE_LIMIT_MAX) {
			logger.warn("WSS per-connection rate limit exceeded", { context: {
				clientIdentity,
				requestCount: connectionState.requestCount,
			} });
			return false;
		}
	}
	return true;
}

export function clearRateLimiterKey(key: string): void {
	UNAUTH_SIGN_ATTEMPTS.delete(key);
}
