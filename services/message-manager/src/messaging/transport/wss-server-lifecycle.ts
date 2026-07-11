import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import type { ClientVerifier } from "./client-verifier";

const WSS_SHUTDOWN_TIMEOUT_MS = 5_000;

export class WssServerLifecycle {
	private _wss: WebSocketServer | null = null;

	constructor(private readonly _clientVerifier: ClientVerifier) {}

	attach(
		server: HttpsServer,
		onConnection: (ws: WebSocket, req: IncomingMessage) => void
	): void {
		this._wss = new WebSocketServer({
			server,
			path: "/ws",
			maxPayload: ENV.MAX_PAYLOAD_BYTES,
			verifyClient: (info, cb) => this._clientVerifier.verifyClient(info, cb),
		});
		this._wss.on("connection", (ws, req) => onConnection(ws, req));
		logger.info("WSS transport attached at /ws");
	}

	async shutdown(): Promise<void> {
		this._closeAllConnections();
		await this._closeServer();
	}

	private _closeAllConnections(): void {
		if (!this._wss) {
			return;
		}
		for (const client of this._wss.clients) {
			client.close(1001, "Server shutdown");
		}
	}

	private async _closeServer(): Promise<void> {
		if (!this._wss) {
			return;
		}
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				resolve();
			}, WSS_SHUTDOWN_TIMEOUT_MS);
			timer.unref();
			this._wss!.close(() => {
				clearTimeout(timer);
				resolve();
			});
		});
	}
}
