import type https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import WebSocket, { WebSocketServer } from "ws";
import type {
	SchedulerOutgoingMessage,
	WorkerIncomingMessage,
} from "../types/worker.types";
import type { WorkerRegistry } from "./worker-registry";

export class WorkerProtocol {
	private readonly _wss: WebSocketServer;
	private readonly _connections: Map<string, WebSocket> = new Map();
	private readonly _handlers: Record<
		string,
		(message: WorkerIncomingMessage, ws?: WebSocket) => void
	>;

	constructor(
		server: https.Server,
		private readonly _workerRegistry: WorkerRegistry,
		private readonly _onWorkerDisconnect: (workerId: string) => void
	) {
		this._wss = new WebSocketServer({ server });
		this._handlers = _buildHandlers(this);
		this._wss.on("connection", (ws: WebSocket) => {
			this._setupWsHandlers(ws);
		});
	}

	private _setupWsHandlers(ws: WebSocket): void {
		ws.on("message", (data: WebSocket.Data) => {
			_handleWsMessage(data, this._handlers, ws);
		});

		ws.on("close", () => {
			_handleWsClose(
				ws,
				this._connections,
				this._workerRegistry,
				this._onWorkerDisconnect
			);
		});
	}
}

function _buildHandlers(
	self: WorkerProtocol
): Record<string, (message: WorkerIncomingMessage, ws?: WebSocket) => void> {
	return {
		register: (msg, ws) =>
			self._handleRegister(
				msg as Parameters<typeof self._handleRegister>[0],
				ws!
			),
		heartbeat: (msg) =>
			self._handleHeartbeat(msg as Parameters<typeof self._handleHeartbeat>[0]),
		disconnect: (msg) =>
			self._handleDisconnect(
				msg as Parameters<typeof self._handleDisconnect>[0]
			),
	};
}

function _handleWsMessage(
	data: WebSocket.Data,
	handlers: Record<
		string,
		(message: WorkerIncomingMessage, ws?: WebSocket) => void
	>,
	ws: WebSocket
): void {
	try {
		const message: WorkerIncomingMessage = JSON.parse(data.toString());
		const handler = handlers[message.type];
		if (handler) {
			handler(message, ws);
		}
	} catch (err) {
		logger.error("Invalid WebSocket message from worker", {
			context: {
				error: err instanceof Error ? err.message : String(err),
			},
		});
	}
}

function _handleWsClose(
	ws: WebSocket,
	connections: Map<string, WebSocket>,
	workerRegistry: WorkerRegistry,
	onWorkerDisconnect: (workerId: string) => void
): void {
	for (const [workerId, conn] of connections) {
		if (conn === ws) {
			connections.delete(workerId);
			workerRegistry.setStatus(workerId, "draining");
			onWorkerDisconnect(workerId);
			break;
		}
	}
}

export class WorkerProtocol {
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
			context: {
				workerId: message.workerId,
			},
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
			context: {
				workerId: message.workerId,
				reason: message.reason,
			},
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
