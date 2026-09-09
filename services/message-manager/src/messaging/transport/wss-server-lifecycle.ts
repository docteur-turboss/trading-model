import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import { logger } from "../../config/logger";
import { ENV } from "../../infrastructure/config/env";
import type { ClientVerifier } from "./client-verifier";

const WSS_SHUTDOWN_TIMEOUT_MS = 5_000;

export class WssServerLifecycle {
	constructor(private readonly _clientVerifier: ClientVerifier) {}

	attach(
		server: HttpsServer,
		onConnection: (ws: WebSocket, req: IncomingMessage) => void
	): WebSocketServer {
		const wss = new WebSocketServer({
			server,
			path: "/ws",
			maxPayload: ENV.MAX_PAYLOAD_BYTES,
			verifyClient: (info, cb) => this._clientVerifier.verifyClient(info, cb),
		});
		wss.on("connection", (ws, req) => onConnection(ws, req));
		logger.info("WSS transport attached at /ws");
		return wss;
	}

	async shutdown(wss: WebSocketServer): Promise<void> {
		this._closeAllConnections(wss);
		await this._closeServer(wss);
	}

	private _closeAllConnections(wss: WebSocketServer): void {
		for (const client of wss.clients) {
			client.close(1001, "Server shutdown");
		}
	}

	private async _closeServer(wss: WebSocketServer): Promise<void> {
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				resolve();
			}, WSS_SHUTDOWN_TIMEOUT_MS);
			timer.unref();
			wss.close(() => {
				clearTimeout(timer);
				resolve();
			});
		});
	}
}
