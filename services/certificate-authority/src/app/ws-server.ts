import type { RawData, WebSocket } from "ws";

import { checkSignRequestRateLimit } from "./rate-limiter";
import { handleAuthMessage } from "./ws-auth";
import { WsMessageRouter } from "./ws-message-router";
import { sendRateLimitError, sendSignError } from "./ws-response-formatter";
import type { WssSession } from "./ws-sign-handler";
import { handleSignRequest, WS_SIGN_SCHEMA } from "./ws-sign-handler";

const messageRouter = new WsMessageRouter();

messageRouter.register({
	type: "auth",
	handle(
		ws: WebSocket,
		msg: Record<string, unknown>,
		session: WssSession
	): void {
		handleAuthMessage({
			ws,
			authMsg: msg as { type: "auth"; token: string },
			state: session.state,
			clientIdentity: session.clientIdentity,
		});
	},
});

messageRouter.register({
	type: "sign",
	async handle(
		ws: WebSocket,
		msg: Record<string, unknown>,
		session: WssSession
	): Promise<void> {
		const parsed = WS_SIGN_SCHEMA.safeParse(msg);
		if (!parsed.success) {
			sendSignError(ws, (msg.id as string) ?? "unknown", "Invalid request");
			return;
		}

		if (
			!checkSignRequestRateLimit(
				session.state,
				session.clientIdentity,
				session.limiterKey
			)
		) {
			sendRateLimitError(ws);
			return;
		}

		await handleSignRequest(ws, parsed.data, session);
	},
});

import {
	attachWsServer,
	handleWsClose,
	handleWsError,
	initConnectionState,
} from "./ws-connection";

function _onWsConnection(
	ws: WebSocket,
	req: import("node:http").IncomingMessage
): void {
	const session: WssSession = initConnectionState(req);

	ws.on("message", (raw: RawData) => {
		void messageRouter.dispatch(ws, raw, session);
	});
	ws.on("close", () =>
		handleWsClose(session.limiterKey, session.clientIdentity)
	);
	ws.on("error", (err) => handleWsError(err, session.clientIdentity));
}

export { attachWsServer };
