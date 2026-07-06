import WebSocket from "ws";

import { logger } from "@trading-model/common/config/logger";
import { isWsConnected } from "@trading-model/common/domain/ws-connection";

export class WsAuthSender {
	constructor(private readonly _bootstrapToken?: string) {}

	send(ws: WebSocket | null): void {
		const token = this._bootstrapToken;
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
			},
		);
	}
}
