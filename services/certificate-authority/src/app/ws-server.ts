import type https from "node:https";
import type { TLSSocket } from "node:tls";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { CONTAINER } from "./container";
import {
	type ConnectionState,
	checkSignRequestRateLimit,
	clearRateLimiterKey,
} from "./rate-limiter";

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

const AUTH_ATTEMPT_MAX = 5;

function isValidTokenFormat(token: string): boolean {
	return (
		typeof token === "string" &&
		token.length >= 16 &&
		token.length <= 1024 &&
		/^[\x20-\x7E]+$/.test(token)
	);
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

function sendAuthResponse(
	ws: WebSocket,
	success: boolean,
	errorMessage?: string
): void {
	ws.send(
		JSON.stringify({
			type: "auth:response",
			success,
			...(errorMessage ? { error: { message: errorMessage } } : {}),
		})
	);
}

function isAuthExceeded(
	state: ConnectionState,
	clientIdentity: string | undefined
): boolean {
	if (state.authAttempts <= AUTH_ATTEMPT_MAX) {
		return false;
	}
	logger.warn("WSS client exceeded max auth attempts, closing connection", {
		context: { clientIdentity },
	});
	return true;
}

function handleValidToken(
	state: ConnectionState,
	token: string,
	clientIdentity: string | undefined,
	ws: WebSocket
): void {
	state.bootstrapToken = token;
	state.tokenProvided = true;
	logger.info(
		"WSS client provided bootstrap token via post-connect auth message",
		{ context: { clientIdentity } }
	);
	sendAuthResponse(ws, true);
}

function handleInvalidToken(
	authMsg: WsAuthMessage,
	clientIdentity: string | undefined,
	ws: WebSocket
): void {
	logger.warn("WSS client sent invalid auth token format", {
		context: {
			clientIdentity,
			length: authMsg.token?.length ?? 0,
		},
	});
	sendAuthResponse(ws, false, "Authentication failed");
}

function _closeOnAuthExceeded(ws: WebSocket, state: ConnectionState, clientIdentity: string | undefined): boolean {
	state.authAttempts++;
	if (isAuthExceeded(state, clientIdentity)) {
		ws.close(4001, "Too many authentication attempts");
		return true;
	}
	return false;
}

function handleAuthMessage({
	ws,
	authMsg,
	state,
	clientIdentity,
}: AuthMessageContext): boolean {
	if (_closeOnAuthExceeded(ws, state, clientIdentity)) {
		return false;
	}
	if (typeof authMsg.token === "string" && isValidTokenFormat(authMsg.token)) {
		handleValidToken(state, authMsg.token, clientIdentity, ws);
	} else {
		handleInvalidToken(authMsg, clientIdentity, ws);
	}
	return true;
}

function _buildSignResponsePayload(id: string, cert: { certPem: string; caPem: string; serialNumber: string; expiresAt: Date; fingerprint: string }): string {
	return JSON.stringify({
		type: "sign:response", id, success: true,
		data: {
			cert: cert.certPem, caPem: cert.caPem, serialNumber: cert.serialNumber,
			expiresAt: cert.expiresAt.toISOString(), fingerprint: cert.fingerprint,
		},
	});
}

function _buildSignErrorPayload(id: string, code: number): string {
	return JSON.stringify({
		type: "sign:response", id, success: false,
		error: { message: "Certificate signing failed", code },
	});
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
		ws.send(_buildSignResponsePayload(signMsg.id, cert));
	} catch (err) {
		const statusCode = (err as Record<string, unknown>).statusCode ?? 500;
		logger.warn("WSS sign error", {
			context: { err: normalizeError(err as Error) },
		});
		ws.send(_buildSignErrorPayload(signMsg.id, statusCode));
	}
}

function _extractClientIdentity(req: import("node:http").IncomingMessage): string | undefined {
	const tlsSocket = req.socket as TLSSocket;
	const clientCert = tlsSocket.getPeerCertificate?.();
	return clientCert?.subject?.CN as string | undefined;
}

function _createConnectionState(): ConnectionState {
	return {
		tokenProvided: false,
		bootstrapToken: undefined,
		authAttempts: 0,
		requestCount: 0,
		requestWindowStart: Date.now(),
	};
}

function initConnectionState(
	req: import("node:http").IncomingMessage
): WssSession {
	const clientIdentity = _extractClientIdentity(req);
	return {
		clientIdentity,
		state: _createConnectionState(),
		limiterKey: clientIdentity ?? "unknown",
	};
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

function _buildRateLimitPayload(): string {
	return JSON.stringify({
		type: "sign:response",
		id: "unknown",
		success: false,
		error: { message: "Rate limit exceeded for unauthenticated requests", code: 429 },
	});
}

function sendRateLimitError(ws: WebSocket): void {
	ws.send(_buildRateLimitPayload());
}

function _handleAuthWsMessage(ws: WebSocket, msg: Record<string, unknown>, session: WssSession): void {
	handleAuthMessage({
		ws,
		authMsg: msg as unknown as WsAuthMessage,
		state: session.state,
		clientIdentity: session.clientIdentity,
	});
}

function _handleInvalidSignRequest(ws: WebSocket, msg: Record<string, unknown>): void {
	logger.warn("WSS invalid sign request", {
		context: { issues: msg },
	});
	sendSignError(ws, (msg.id as string) ?? "unknown", "Invalid request");
}

function _rateLimited(ws: WebSocket, session: WssSession): boolean {
	if (checkSignRequestRateLimit(session.state, session.clientIdentity, session.limiterKey)) {
		return false;
	}
	sendRateLimitError(ws);
	return true;
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
		_handleAuthWsMessage(ws, msg, session);
		return;
	}

	const parsed = WS_SIGN_SCHEMA.safeParse(msg);
	if (!parsed.success) {
		_handleInvalidSignRequest(ws, msg);
		return;
	}

	if (_rateLimited(ws, session)) {
		return;
	}

	await handleSignRequest(ws, parsed.data, session);
}

function handleWsClose(
	limiterKey: string,
	clientIdentity: string | undefined
): void {
	logger.debug("WSS client disconnected from CA", {
		context: { clientIdentity },
	});
	clearRateLimiterKey(limiterKey);
}

function handleWsError(err: Error, clientIdentity: string | undefined): void {
	logger.error("WSS connection error", {
		context: {
			err: err.message,
			clientIdentity,
		},
	});
}

function _onWsConnection(ws: WebSocket, req: import("node:http").IncomingMessage): void {
	const session: WssSession = initConnectionState(req);
	logger.info("WSS client connected to CA (awaiting auth)", {
		context: { clientIdentity: session.clientIdentity },
	});

	ws.on("message", (raw: RawData) => handleWsMessage(ws, raw, session));
	ws.on("close", () => handleWsClose(session.limiterKey, session.clientIdentity));
	ws.on("error", (err) => handleWsError(err, session.clientIdentity));
}

export function attachWsServer(httpsServer: https.Server): WebSocketServer {
	const wss = new WebSocketServer({ server: httpsServer });
	wss.on("connection", _onWsConnection);
	logger.info("WebSocket server attached to HTTPS server");
	return wss;
}
