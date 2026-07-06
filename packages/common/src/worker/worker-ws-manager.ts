import type https from "node:https";

import WebSocket, { WebSocketServer } from "ws";
import { logger } from "../config/logger";
import type {
	SchedulerOutgoingMessage,
	WorkerIncomingMessage,
} from "../contracts/worker-protocol.types";

export class WorkerWsManager {
	private readonly _wss: WebSocketServer;
	readonly connections: Map<string, WebSocket> = new Map();

	constructor(
		server: https.Server,
		private readonly _onMessage: (
			message: WorkerIncomingMessage,
			ws: WebSocket
		) => void,
		private readonly _onClose: (ws: WebSocket) => void
	) {
		this._wss = new WebSocketServer({ server });
		this._wss.on("connection", (ws: WebSocket) => this._onConnection(ws));
	}

	private _onConnection(ws: WebSocket): void {
		ws.on("message", (data: WebSocket.Data) => this._onWsMessage(ws, data));
		ws.on("close", () => this._onClose(ws));
	}

	private _onWsMessage(ws: WebSocket, data: WebSocket.Data): void {
		try {
			const message: WorkerIncomingMessage = JSON.parse(data.toString());
			this._onMessage(message, ws);
		} catch (err) {
			logger.error("Invalid WebSocket message from worker", {
				context: { error: err instanceof Error ? err.message : String(err) },
			});
		}
	}

	setConnection(workerId: string, ws: WebSocket): void {
		this.connections.set(workerId, ws);
	}

	getConnection(workerId: string): WebSocket | undefined {
		return this.connections.get(workerId);
	}

	deleteConnection(workerId: string): void {
		this.connections.delete(workerId);
	}

	findWorkerIdByWs(ws: WebSocket): string | undefined {
		for (const [workerId, conn] of this.connections) {
			if (conn === ws) {
				return workerId;
			}
		}
	}

	sendToWorker(workerId: string, message: SchedulerOutgoingMessage): void {
		const ws = this.connections.get(workerId);
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	sendDrain(workerId: string): void {
		this.sendToWorker(workerId, { type: "drain" });
	}

	broadcastDrain(): void {
		for (const [workerId] of this.connections) {
			this.sendDrain(workerId);
		}
	}

	close(): void {
		this.broadcastDrain();
		for (const ws of this.connections.values()) {
			ws.close();
		}
		this.connections.clear();
		this._wss.close();
	}
}
