import { logger } from "@trading-model/common/config/logger";
import type { AuthToken } from "@trading-model/common/domain/primitives";
import type { ClientIdentity } from "@trading-model/common/domain/primitives/string-ids";
import type { WebSocket } from "ws";
import type { ConnectionState } from "./rate-limiter";
import { WsMessageType } from "./ws-message-router";

const AUTH_ATTEMPT_MAX = 5;

interface WsAuthMessage {
	type: WsMessageType.Auth;
	token: AuthToken;
}

function isValidTokenFormat(token: AuthToken): boolean {
	return (
		typeof token === "string" &&
		token.length >= 16 &&
		token.length <= 1024 &&
		/^[\x20-\x7E]+$/.test(token)
	);
}

function sendAuthResponse(
	ws: WebSocket,
	success: boolean,
	errorMessage?: string
): void {
	ws.send(
		JSON.stringify({
			type: WsMessageType.AuthResponse,
			success,
			...(errorMessage ? { error: { message: errorMessage } } : {}),
		})
	);
}

function isAuthExceeded(
	state: ConnectionState,
	clientIdentity: ClientIdentity | undefined
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
	token: AuthToken,
	clientIdentity: ClientIdentity | undefined,
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
	clientIdentity: ClientIdentity | undefined,
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

function _closeOnAuthExceeded(
	ws: WebSocket,
	state: ConnectionState,
	clientIdentity: ClientIdentity | undefined
): boolean {
	state.authAttempts++;
	if (isAuthExceeded(state, clientIdentity)) {
		ws.close(4001, "Too many authentication attempts");
		return true;
	}
	return false;
}

export interface AuthMessageContext {
	ws: WebSocket;
	authMsg: WsAuthMessage;
	state: ConnectionState;
	clientIdentity?: ClientIdentity;
}

export function handleAuthMessage({
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
