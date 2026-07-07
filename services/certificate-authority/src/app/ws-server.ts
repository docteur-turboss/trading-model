import type { RawData, WebSocket } from "ws";

import { checkSignRequestRateLimit } from "./rate-limiter";
import { handleAuthMessage } from "./ws-auth";
import {
	attachWsServer,
	handleWsClose,
	handleWsError,
	initConnectionState,
} from "./ws-connection";
import type { WssSession } from "./ws-sign-handler";
import { handleSignRequest, WS_SIGN_SCHEMA } from "./ws-sign-handler";

function _onWsConnection(
	ws: WebSocket,
	req: import("node:http").IncomingMessage
): void {
	const session: WssSession = initConnectionState(req);

	ws.on("message", (raw: RawData) => {
		void handleWsMessage(ws, raw, session);
	});
	ws.on("close", () =>
		handleWsClose(session.limiterKey, session.clientIdentity)
	);
	ws.on("error", (err) => handleWsError(err, session.clientIdentity));
}

async function handleWsMessage(
	ws: WebSocket,
	raw: RawData,
	session: WssSession
): Promise<void> {
	const msg = _parseWsMessage(raw);
	if (!msg) {
		_sendJsonError(ws, "Invalid JSON");
		return;
	}

	switch (msg.type) {
		case "auth": {
			handleAuthMessage({
				ws,
				authMsg: msg as unknown as { type: "auth"; token: string },
				state: session.state,
				clientIdentity: session.clientIdentity,
			});
			return;
		}
		case "sign": {
			const parsed = WS_SIGN_SCHEMA.safeParse(msg);
			if (!parsed.success) {
				_sendSignError(ws, (msg.id as string) ?? "unknown", "Invalid request");
				return;
			}
			if (_isRateLimited(ws, session)) {
				return;
			}
			await handleSignRequest(ws, parsed.data, session);
			return;
		}
		default:
			_sendJsonError(ws, `Unknown message type: ${String(msg.type)}`);
	}
}

function _parseWsMessage(raw: RawData): Record<string, unknown> | null {
	try {
		return JSON.parse(raw.toString()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function _sendJsonError(ws: WebSocket, message: string): void {
	ws.send(JSON.stringify({ type: "error", error: { message } }));
}

function _sendSignError(ws: WebSocket, id: string, message: string): void {
	ws.send(
		JSON.stringify({
			type: "sign:response",
			id,
			success: false,
			error: { message },
		})
	);
}

function _isRateLimited(ws: WebSocket, session: WssSession): boolean {
	if (
		checkSignRequestRateLimit(
			session.state,
			session.clientIdentity,
			session.limiterKey
		)
	) {
		return false;
	}
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
	return true;
}

export { attachWsServer };
