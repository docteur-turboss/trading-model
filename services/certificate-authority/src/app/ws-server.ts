import type https from "node:https";
import type { TLSSocket } from "node:tls";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { CONTAINER } from "./container";

const WS_SIGN_SCHEMA = z.object({
	type: z.literal("sign"),
	id: z.string().min(1),
	data: z.object({
		serviceId: z.string().min(1),
		csr: z.string().min(1),
		ttlMs: z.number().positive().optional(),
	}),
});

interface WsAuthMessage {
	type: "auth";
	token: string;
}

/**
 * Rate limiter for unauthenticated WSS sign requests.
 * Prevents brute-force attacks on the bootstrap token.
 */
const UNAUTH_SIGN_ATTEMPTS = new Map<
	string,
	{ count: number; resetAt: number }
>();
const UNAUTH_RATE_LIMIT = 3; // max unauthenticated sign requests
const UNAUTH_WINDOW_MS = 60_000; // per 60s window
const UNAUTH_BAN_MS = 300_000; // 5 min ban after exceeding limit
const UNAUTH_CLEANUP_MS = 60_000; // purge expired entries every 60s
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of UNAUTH_SIGN_ATTEMPTS) {
		if (now > entry.resetAt + UNAUTH_BAN_MS) {
			UNAUTH_SIGN_ATTEMPTS.delete(key);
		}
	}
}, UNAUTH_CLEANUP_MS).unref();

function checkUnauthRateLimit(clientIdentity: string): boolean {
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

/** Per-connection rate limiter for all WSS sign requests (authenticated or not). */
const AUTH_RATE_LIMIT_MAX = 100; // max sign requests per connection
const AUTH_RATE_LIMIT_MS = 60_000; // per 60s window
const AUTH_ATTEMPT_MAX = 5; // max auth attempts before connection close

/** Validates that a token has plausible format (not just any non-empty string). */
function isValidTokenFormat(token: string): boolean {
	return (
		typeof token === "string" &&
		token.length >= 16 &&
		token.length <= 1024 &&
		/^[\x20-\x7E]+$/.test(token)
	);
}

export function attachWsServer(httpsServer: https.Server): WebSocketServer {
	const wss = new WebSocketServer({ server: httpsServer });

	wss.on("connection", (ws: WebSocket, req) => {
		const tlsSocket = req.socket as TLSSocket;
		const clientCert = tlsSocket.getPeerCertificate?.();
		const clientIdentity = clientCert?.subject?.CN as string | undefined;

		// 5a: Token is NOT extracted from Upgrade header.
		// It is received as a dedicated 'auth' message post-connection.
		// This prevents token leakage into load balancer / proxy logs.
		//
		// IMPORTANT: The `tokenProvided` flag means "a well-formed token was received",
		// NOT that the token is valid. Actual token validation happens atomically inside
		// distributor.requestCertificate() → validateBootstrapToken() → tokenStore.tryUseToken().
		// This design:
		//   1. Eliminates the TOCTOU window between isUsed() and tryUseToken()
		//   2. Prevents leaking which tokens are valid before a sign request is made
		//   3. The server never tells the client whether the stored token is valid
		let tokenProvided = false;
		let bootstrapToken: string | undefined;
		let authAttempts = 0;
		let requestCount = 0;
		let requestWindowStart = Date.now();

		const limiterKey = clientIdentity ?? "unknown";

		logger.info("WSS client connected to CA (awaiting auth)", {
			clientIdentity,
		});

		ws.on("message", async (raw: RawData) => {
			let msg: Record<string, unknown>;
			try {
				msg = JSON.parse(raw.toString()) as Record<string, unknown>;
			} catch {
				ws.send(
					JSON.stringify({ type: "error", error: { message: "Invalid JSON" } })
				);
				return;
			}

			// Handle auth message — token sent post-connection
			// Token is NOT consumed here. The atomic consumption is done inside
			// distributor.requestCertificate() → validateBootstrapToken() → tokenStore.tryUseToken().
			// This eliminates the TOCTOU window between the old isUsed() check and tryUseToken().
			// NOTE: auth:response with success:true means the server received a well-formed token,
			// NOT that the token is valid. Actual validation happens atomically during the sign
			// request (tokenProvided + bootstrapToken are passed to requestCertificate() which
			// validates). This design avoids leaking which tokens are valid.
			if (msg.type === "auth") {
				authAttempts++;
				if (authAttempts > AUTH_ATTEMPT_MAX) {
					logger.warn(
						"WSS client exceeded max auth attempts, closing connection",
						{
							clientIdentity,
						}
					);
					ws.close(4001, "Too many authentication attempts");
					return;
				}
				const authMsg = msg as unknown as WsAuthMessage;
				if (
					typeof authMsg.token === "string" &&
					isValidTokenFormat(authMsg.token)
				) {
					bootstrapToken = authMsg.token;
					tokenProvided = true;
					logger.info(
						"WSS client provided bootstrap token via post-connect auth message",
						{
							clientIdentity,
						}
					);
					ws.send(JSON.stringify({ type: "auth:response", success: true }));
				} else {
					logger.warn("WSS client sent invalid auth token format", {
						clientIdentity,
						length: authMsg.token?.length ?? 0,
					});
					ws.send(
						JSON.stringify({
							type: "auth:response",
							success: false,
							error: { message: "Authentication failed" },
						})
					);
				}
				return;
			}

			// Validate sign messages with Zod
			const parsed = WS_SIGN_SCHEMA.safeParse(msg);
			if (!parsed.success) {
				logger.warn("WSS invalid sign request", {
					issues: parsed.error.issues,
				});
				ws.send(
					JSON.stringify({
						type: "sign:response",
						id: ((msg as Record<string, unknown>).id as string) ?? "unknown",
						success: false,
						error: { message: "Invalid request" },
					})
				);
				return;
			}

			const signMsg = parsed.data;

			// 5c: Rate-limit sign requests that carry no bootstrap token
			// (strict limit prevents brute-force guessing of tokens)
			if (!(tokenProvided || checkUnauthRateLimit(limiterKey))) {
				ws.send(
					JSON.stringify({
						type: "sign:response",
						id: signMsg.id,
						success: false,
						error: {
							message: "Rate limit exceeded for unauthenticated requests",
							code: 429,
						},
					})
				);
				return;
			}

			// Per-connection rate limit for all sign requests (prevents single connection flood)
			const elapsed = Date.now() - requestWindowStart;
			if (elapsed > AUTH_RATE_LIMIT_MS) {
				requestCount = 1;
				requestWindowStart = Date.now();
			} else {
				requestCount++;
				if (requestCount > AUTH_RATE_LIMIT_MAX) {
					logger.warn("WSS per-connection rate limit exceeded, closing", {
						clientIdentity,
						requestCount,
					});
					ws.close(4001, "Rate limit exceeded");
					return;
				}
			}

			// 5b: Token is single-use — once used, it is marked as consumed.
			// Token validation happens inside distributor.requestCertificate
			// which calls TokenStore.tryUseToken() with atomic MongoDB upsert.
			try {
				const cert = await CONTAINER.distributor.requestCertificate(
					signMsg.data.serviceId,
					signMsg.data.csr,
					tokenProvided ? bootstrapToken : undefined
				);

				ws.send(
					JSON.stringify({
						type: "sign:response",
						id: signMsg.id,
						success: true,
						data: {
							cert: cert.certPem,
							caPem: cert.caPem,
							serialNumber: cert.serialNumber,
							expiresAt: cert.expiresAt.toISOString(),
							fingerprint: cert.fingerprint,
						},
					})
				);
			} catch (err) {
				const statusCode = (err as Record<string, unknown>).statusCode ?? 500;
				logger.warn("WSS sign error", { err: normalizeError(err as Error) });

				ws.send(
					JSON.stringify({
						type: "sign:response",
						id: signMsg.id,
						success: false,
						error: { message: "Certificate signing failed", code: statusCode },
					})
				);
			}
		});

		ws.on("close", () => {
			logger.debug("WSS client disconnected from CA", { clientIdentity });
			UNAUTH_SIGN_ATTEMPTS.delete(limiterKey);
		});

		ws.on("error", (err) => {
			logger.error("WSS connection error", {
				err: err.message,
				clientIdentity,
			});
		});
	});

	logger.info("WebSocket server attached to HTTPS server");

	return wss;
}
