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

function _resetEntry(clientIdentity: string): void {
	UNAUTH_SIGN_ATTEMPTS.set(clientIdentity, {
		count: 1,
		resetAt: Date.now() + UNAUTH_WINDOW_MS,
	});
}

function _isBanned(entry: { count: number; resetAt: number }): boolean {
	return Date.now() > entry.resetAt + UNAUTH_BAN_MS;
}

export function checkUnauthRateLimit(clientIdentity: string): boolean {
	const now = Date.now();
	const entry = UNAUTH_SIGN_ATTEMPTS.get(clientIdentity);
	if (!entry || now > entry.resetAt) {
		_resetEntry(clientIdentity);
		return true;
	}
	if (entry.count >= UNAUTH_RATE_LIMIT) {
		if (_isBanned(entry)) {
			_resetEntry(clientIdentity);
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

function _resetRequestWindow(connectionState: ConnectionState): void {
	connectionState.requestCount = 1;
	connectionState.requestWindowStart = Date.now();
}

function _logRateLimitExceeded(
	clientIdentity: string | undefined,
	requestCount: number
): void {
	logger.warn("WSS per-connection rate limit exceeded", {
		context: { clientIdentity, requestCount },
	});
}

function _checkConnectionRateLimit(
	connectionState: ConnectionState,
	clientIdentity: string | undefined
): boolean {
	const elapsed = Date.now() - connectionState.requestWindowStart;
	if (elapsed > AUTH_RATE_LIMIT_MS) {
		_resetRequestWindow(connectionState);
		return true;
	}
	connectionState.requestCount++;
	if (connectionState.requestCount > AUTH_RATE_LIMIT_MAX) {
		_logRateLimitExceeded(clientIdentity, connectionState.requestCount);
		return false;
	}
	return true;
}

export function checkSignRequestRateLimit(
	connectionState: ConnectionState,
	clientIdentity: string | undefined,
	limiterKey: string
): boolean {
	if (!(connectionState.tokenProvided || checkUnauthRateLimit(limiterKey))) {
		return false;
	}
	return _checkConnectionRateLimit(connectionState, clientIdentity);
}

export function clearRateLimiterKey(key: string): void {
	UNAUTH_SIGN_ATTEMPTS.delete(key);
}
