import type https from "node:https";
import WebSocket from "ws";
import { logger } from "../config/logger";
import type {
	SchedulerOutgoingMessage,
	WorkerIncomingMessage,
} from "../contracts/worker-protocol.types";
import type { WorkerRegistry } from "./worker-registry";
import { WorkerWsManager } from "./worker-ws-manager";

export interface IWorkerProtocol {
	sendToWorker(workerId: string, message: SchedulerOutgoingMessage): void;
	sendDrain(workerId: string): void;
	broadcastDrain(): void;
	close(): void;
}

export class WorkerProtocol implements IWorkerProtocol {
	private readonly _wsManager: WorkerWsManager;
	private readonly _handlers: Partial<
		Record<
			WorkerIncomingMessage["type"],
			(message: WorkerIncomingMessage, ws?: WebSocket) => void
		>
	>;

	constructor(
		server: https.Server,
		private readonly _workerRegistry: WorkerRegistry,
		private readonly _onWorkerDisconnect: (workerId: string) => void
	) {
		this._wsManager = new WorkerWsManager(
			server,
			(msg, ws) => this._onWsMessage(msg, ws),
			(ws) => this._onWsClose(ws)
		);
		this._handlers = {
			register: (msg, ws) =>
				this._handleRegister(
					msg as Parameters<typeof this._handleRegister>[0],
					ws!
				),
			heartbeat: (msg) =>
				this._handleHeartbeat(
					msg as Parameters<typeof this._handleHeartbeat>[0]
				),
			disconnect: (msg) =>
				this._handleDisconnect(
					msg as Parameters<typeof this._handleDisconnect>[0]
				),
		};
	}

	private _onWsMessage(message: WorkerIncomingMessage, ws: WebSocket): void {
		this._handlers[message.type]?.(message, ws);
	}
	private _onWsClose(ws: WebSocket): void {
		const workerId = this._wsManager.findWorkerIdByWs(ws);
		if (workerId) {
			this._wsManager.deleteConnection(workerId);
			this._workerRegistry.setStatus(workerId, "draining");
			this._onWorkerDisconnect(workerId);
		}
	}
	private _handleRegister(
		message: WorkerIncomingMessage & { type: "register" },
		ws: WebSocket
	): void {
		this._workerRegistry.register(message.workerId, {
			workerId: message.workerId,
			host: message.host,
			port: message.port,
			capabilities: message.capabilities,
			maxConcurrency: message.maxConcurrency,
			currentLoad: 0,
		});
		this._wsManager.setConnection(message.workerId, ws);
		logger.info("Worker registered via WebSocket", {
			context: { workerId: message.workerId },
		});
	}
	private _handleHeartbeat(
		message: WorkerIncomingMessage & { type: "heartbeat" }
	): void {
		this._workerRegistry.heartbeat(message.workerId);
		this._workerRegistry.updateLoad(message.workerId, message.currentLoad);
		const ws = this._wsManager.getConnection(message.workerId);
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: "heartbeat.ack" }));
		}
	}
	private _handleDisconnect(
		message: WorkerIncomingMessage & { type: "disconnect" }
	): void {
		this._wsManager.deleteConnection(message.workerId);
		this._workerRegistry.unregister(message.workerId);
		this._onWorkerDisconnect(message.workerId);
		logger.info("Worker disconnected", {
			context: { workerId: message.workerId, reason: message.reason },
		});
	}

	sendToWorker(workerId: string, message: SchedulerOutgoingMessage): void {
		this._wsManager.sendToWorker(workerId, message);
	}
	sendDrain(workerId: string): void {
		this._wsManager.sendDrain(workerId);
	}
	broadcastDrain(): void {
		this._wsManager.broadcastDrain();
	}
	close(): void {
		this._wsManager.close();
	}
}
