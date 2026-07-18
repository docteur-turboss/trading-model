import { logger } from "@trading-model/common/config/logger";
import { isWsConnected } from "@trading-model/common/domain/ws-connection";
import type WebSocket from "ws";

export function sendWsAuth(
	ws: WebSocket | null | undefined,
	bootstrapToken?: string
): void {
	const token = bootstrapToken;
	if (!token || token.length === 0 || !isWsConnected(ws)) {
		return;
	}
	ws.send(
		JSON.stringify({
			type: "auth",
			token,
		}),
		(err) => {
			if (err) {
				logger.error("Failed to send WSS auth message", { err: err.message });
			}
		}
	);
}
