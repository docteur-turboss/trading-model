import type https from "node:https";

import WebSocket, { WebSocketServer } from "ws";
import { logger } from "../config/logger";
import type {
	SchedulerOutgoingMessage,
	WorkerIncomingMessage,
} from "../contracts/worker-protocol.types";
import type { WorkerRegistry } from "./worker-registry";

export class WorkerProtocol {
	private readonly _wss: WebSocketServer;
	private readonly _connections: Map<string, WebSocket> = new Map();

	constructor(
		server: https.Server,
		private readonly _workerRegistry: WorkerRegistry,
		private readonly _onWorkerDisconnect: (workerId: string) => void
	) {
		this._wss = new WebSocketServer({ server });

		this._wss.on("connection", (ws: WebSocket) => {
			ws.on("message", (data: WebSocket.Data) => {
				try {
					const message: WorkerIncomingMessage = JSON.parse(data.toString());

					switch (message.type) {
						case "register":
							this._handleRegister(message, ws);
							break;
						case "heartbeat":
							this._handleHeartbeat(message);
							break;
						case "disconnect":
							this._handleDisconnect(message);
							break;
						default:
							break;
					}
				} catch (err) {
					logger.error("Invalid WebSocket message from worker", {
						error: err instanceof Error ? err.message : String(err),
					});
				}
			});

			ws.on("close", () => {
				for (const [workerId, conn] of this._connections) {
					if (conn === ws) {
						this._connections.delete(workerId);
						this._workerRegistry.setStatus(workerId, "draining");
						this._onWorkerDisconnect(workerId);
						break;
					}
				}
			});
		});
	}

	private _handleRegister(
		message: WorkerIncomingMessage & { type: "register" },
		ws: WebSocket
	): void {
		this._workerRegistry.register(message.workerId, {
			workerId: message.workerId,
			address: message.address,
			port: message.port,
			capabilities: message.capabilities,
			maxConcurrency: message.maxConcurrency,
			currentLoad: 0,
		});
		this._connections.set(message.workerId, ws);

		logger.info("Worker registered via WebSocket", {
			workerId: message.workerId,
		});
	}

	private _handleHeartbeat(
		message: WorkerIncomingMessage & { type: "heartbeat" }
	): void {
		this._workerRegistry.heartbeat(message.workerId);
		this._workerRegistry.updateLoad(message.workerId, message.currentLoad);

		const ws = this._connections.get(message.workerId);
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: "heartbeat.ack" }));
		}
	}

	private _handleDisconnect(
		message: WorkerIncomingMessage & { type: "disconnect" }
	): void {
		this._connections.delete(message.workerId);
		this._workerRegistry.unregister(message.workerId);
		this._onWorkerDisconnect(message.workerId);

		logger.info("Worker disconnected", {
			workerId: message.workerId,
			reason: message.reason,
		});
	}

	sendToWorker(workerId: string, message: SchedulerOutgoingMessage): void {
		const ws = this._connections.get(workerId);
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	sendDrain(workerId: string): void {
		this.sendToWorker(workerId, { type: "drain" });
	}

	broadcastDrain(): void {
		for (const [workerId] of this._connections) {
			this.sendDrain(workerId);
		}
	}

	close(): void {
		this.broadcastDrain();
		for (const ws of this._connections.values()) {
			ws.close();
		}
		this._connections.clear();
		this._wss.close();
	}
}
