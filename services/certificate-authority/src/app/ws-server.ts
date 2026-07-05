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

interface ConnectionState {
	tokenProvided: boolean;
	bootstrapToken: string | undefined;
	authAttempts: number;
	requestCount: number;
	requestWindowStart: number;
}

interface AuthMessageContext {
	ws: WebSocket;
	authMsg: WsAuthMessage;
	state: ConnectionState;
	clientIdentity?: string;
}

interface WssSession {
	state: ConnectionState;
	clientIdentity: string | undefined;
	limiterKey: string;
}

function handleAuthMessage({
	ws,
	authMsg,
	state,
	clientIdentity,
}: AuthMessageContext): boolean {
	state.authAttempts++;
	if (state.authAttempts > AUTH_ATTEMPT_MAX) {
		logger.warn("WSS client exceeded max auth attempts, closing connection", {
			clientIdentity,
		});
		ws.close(4001, "Too many authentication attempts");
		return false;
	}
	if (typeof authMsg.token === "string" && isValidTokenFormat(authMsg.token)) {
		state.bootstrapToken = authMsg.token;
		state.tokenProvided = true;
		logger.info(
			"WSS client provided bootstrap token via post-connect auth message",
			{ clientIdentity }
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
	return true;
}

async function handleSignRequest(
	ws: WebSocket,
	signMsg: z.infer<typeof WS_SIGN_SCHEMA>,
	session: WssSession
): Promise<void> {
	try {
		const cert = await CONTAINER.distributor.requestCertificate(
			signMsg.data.serviceId,
			signMsg.data.csr,
			session.state.tokenProvided ? session.state.bootstrapToken : undefined
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
}

function checkSignRequestRateLimit(
	ws: WebSocket,
	session: WssSession
): boolean {
	if (!(session.state.tokenProvided || checkUnauthRateLimit(session.limiterKey))) {
		ws.send(
			JSON.stringify({
				type: "sign:response",
				id: "unknown",
				success: false,
				error: {
					message: "Rate limit exceeded for unauthenticated requests",
					code: 429,
				},
			})
		);
		return false;
	}

	const elapsed = Date.now() - session.state.requestWindowStart;
	if (elapsed > AUTH_RATE_LIMIT_MS) {
		session.state.requestCount = 1;
		session.state.requestWindowStart = Date.now();
	} else {
		session.state.requestCount++;
		if (session.state.requestCount > AUTH_RATE_LIMIT_MAX) {
			logger.warn("WSS per-connection rate limit exceeded, closing", {
				clientIdentity: session.clientIdentity,
				requestCount: session.state.requestCount,
			});
			ws.close(4001, "Rate limit exceeded");
			return false;
		}
	}
	return true;
}

function initConnectionState(req: import("node:http").IncomingMessage): WssSession {
	const tlsSocket = req.socket as TLSSocket;
	const clientCert = tlsSocket.getPeerCertificate?.();
	const clientIdentity = clientCert?.subject?.CN as string | undefined;
	return {
		clientIdentity,
		state: {
			tokenProvided: false,
			bootstrapToken: undefined,
			authAttempts: 0,
			requestCount: 0,
			requestWindowStart: Date.now(),
		},
		limiterKey: clientIdentity ?? "unknown",
	} satisfies WssSession;
}

function parseWsMessage(raw: RawData): Record<string, unknown> | null {
	try {
		return JSON.parse(raw.toString()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function sendJsonError(ws: WebSocket, message: string): void {
	ws.send(JSON.stringify({ type: "error", error: { message } }));
}

function sendSignError(ws: WebSocket, id: string, message: string): void {
	ws.send(
		JSON.stringify({
			type: "sign:response",
			id,
			success: false,
			error: { message },
		})
	);
}
async function handleWsMessage(
	ws: WebSocket,
	raw: RawData,
	session: WssSession
): Promise<void> {
	const msg = parseWsMessage(raw);
	if (!msg) {
		sendJsonError(ws, "Invalid JSON");
		return;
	}

	if (msg.type === "auth") {
		handleAuthMessage({
			ws,
			authMsg: msg as unknown as WsAuthMessage,
			state: session.state,
			clientIdentity: session.clientIdentity,
		});
		return;
	}

	const parsed = WS_SIGN_SCHEMA.safeParse(msg);
	if (!parsed.success) {

		logger.warn("WSS invalid sign request", {
			issues: parsed.error.issues,
		});
		sendSignError(ws, (msg.id as string) ?? "unknown", "Invalid request");
		return;
	}

	if (!checkSignRequestRateLimit(ws, session)) {
		return;
	}

	await handleSignRequest(ws, parsed.data, session);
}

function handleWsClose(
	limiterKey: string,
	clientIdentity: string | undefined
): void {
	logger.debug("WSS client disconnected from CA", { clientIdentity });
	UNAUTH_SIGN_ATTEMPTS.delete(limiterKey);
}

function handleWsError(err: Error, clientIdentity: string | undefined): void {
	logger.error("WSS connection error", {
		err: err.message,
		clientIdentity,
	});
}

export function attachWsServer(httpsServer: https.Server): WebSocketServer {
	const wss = new WebSocketServer({ server: httpsServer });

	wss.on("connection", (ws: WebSocket, req) => {
		const session: WssSession = initConnectionState(req);
		logger.info("WSS client connected to CA (awaiting auth)", {
			clientIdentity: session.clientIdentity,
		});

		ws.on("message", (raw: RawData) => handleWsMessage(ws, raw, session));
		ws.on("close", () => handleWsClose(session.limiterKey, session.clientIdentity));
		ws.on("error", (err) => handleWsError(err, session.clientIdentity));
	});

	logger.info("WebSocket server attached to HTTPS server");

	return wss;
}
