import type https from "node:https";
import type { TLSSocket } from "node:tls";
import { logger } from "@trading-model/common/config/logger";
import { UnixTimestamp } from "@trading-model/common/domain/primitives";
import { ClientIdentity } from "@trading-model/common/domain/primitives/auth-ids";
import { type WebSocket, WebSocketServer } from "ws";
import type { ConnectionState } from "./rate-limiter";
import { clearRateLimiterKey } from "./rate-limiter";
import type { WssSession } from "./ws-sign-handler";

function _extractClientIdentity(
	req: import("node:http").IncomingMessage
): ClientIdentity | undefined {
	const tlsSocket = req.socket as TLSSocket;
	const clientCert = tlsSocket.getPeerCertificate?.();
	return clientCert?.subject?.CN
		? ClientIdentity.of(clientCert.subject.CN)
		: undefined;
}

function _createConnectionState(): ConnectionState {
	return {
		tokenProvided: false,
		bootstrapToken: undefined,
		authAttempts: 0,
		requestCount: 0,
		requestWindowStart: UnixTimestamp.now(),
	};
}

export function initConnectionState(
	req: import("node:http").IncomingMessage
): WssSession {
	const clientIdentity = _extractClientIdentity(req);
	return {
		clientIdentity,
		state: _createConnectionState(),
		limiterKey: clientIdentity ?? "unknown",
	};
}

export function handleWsClose(
	limiterKey: string,
	clientIdentity: ClientIdentity | undefined
): void {
	logger.debug("WSS client disconnected from CA", {
		context: { clientIdentity },
	});
	clearRateLimiterKey(limiterKey);
}

export function handleWsError(
	err: Error,
	clientIdentity: ClientIdentity | undefined
): void {
	logger.error("WSS connection error", {
		context: {
			err: err.message,
			clientIdentity,
		},
	});
}

export function attachWsServer(
	httpsServer: https.Server,
	onConnection: (
		ws: WebSocket,
		req: import("node:http").IncomingMessage
	) => void
): WebSocketServer {
	const wss = new WebSocketServer({ server: httpsServer });
	wss.on("connection", onConnection);
	logger.info("WebSocket server attached to HTTPS server");
	return wss;
}
