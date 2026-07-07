import type { SchedulerOutgoingMessage, SchedulerWsJobAssignedMessage, WorkerIncomingMessage, WorkerWsHeartbeatMessage } from "../contracts/worker-protocol.types";
import type { Capability } from "../domain/primitives";
import { DefaultWsReconnector } from "../ws/default-ws-reconnector";
import { TypedEventEmitter } from "./typed-event-emitter";
import { WorkerHeartbeat } from "./worker-heartbeat";
import { WorkerMessageRouter } from "./worker-message-router";
import { WorkerWsConnection } from "./worker-ws-connection";

export interface WorkerClientConfig {
	workerId: string;
	serverUrl: string;
	capabilities: Capability[];
	maxConcurrency: number;
	heartbeatIntervalMs?: number;
	reconnectBaseDelayMs?: number;
	reconnectMaxDelayMs?: number;
}
export interface WorkerClientEvents {
	connected: [];
	disconnected: [];
	"heartbeat.ack": [];
	drain: [];
	"job.assigned": [job: SchedulerWsJobAssignedMessage["job"]];
	reconnecting: [info: { attempt: number; delay: number }];
	error: [error: Error];
	unknown: [message: Record<string, unknown>];
}

function normalizeConfig(config: WorkerClientConfig): Required<WorkerClientConfig> {
	return { workerId: config.workerId, serverUrl: config.serverUrl, capabilities: config.capabilities, maxConcurrency: config.maxConcurrency, heartbeatIntervalMs: config.heartbeatIntervalMs ?? 15000, reconnectBaseDelayMs: config.reconnectBaseDelayMs ?? 1000, reconnectMaxDelayMs: config.reconnectMaxDelayMs ?? 30000 };
}

export class WorkerClient extends TypedEventEmitter<WorkerClientEvents> {
	private readonly _cfg: Required<WorkerClientConfig>;
	private readonly _connection: WorkerWsConnection;
	private readonly _reconnector: DefaultWsReconnector;
	private readonly _heartbeat: WorkerHeartbeat;
	private readonly _messageRouter: WorkerMessageRouter;

	constructor(config: WorkerClientConfig) {
		super();
		this._cfg = normalizeConfig(config);
		this._connection = new WorkerWsConnection({ workerId: this._cfg.workerId, serverUrl: this._cfg.serverUrl, capabilities: this._cfg.capabilities, maxConcurrency: this._cfg.maxConcurrency });
		this._reconnector = new DefaultWsReconnector({ config: { baseDelayMs: this._cfg.reconnectBaseDelayMs, maxDelayMs: this._cfg.reconnectMaxDelayMs }, onReconnect: () => this._doConnect(), onSchedule: (info) => this.emit("reconnecting", info) });
		this._heartbeat = new WorkerHeartbeat(this._cfg.workerId, (msg: WorkerWsHeartbeatMessage) => this.send(msg), this._cfg.heartbeatIntervalMs);
		this._messageRouter = new WorkerMessageRouter(this.raw);
		this._connection.onOpen = () => { this._heartbeat.start(); this.emit("connected"); };
		this._connection.onClose = () => {
			this._heartbeat.stop();
			this.emit("disconnected");
			if (!this._reconnector.intentionalClose) this._reconnector.scheduleReconnect();
		};
		this._connection.onMessage = (data) => {
			try { this._messageRouter.handle(JSON.parse(String(data)), (msg) => this.emit("unknown", msg)); } catch (err) { this.emit("error", new Error(`Invalid message from server: ${err}`)); }
		};
		this._connection.onError = (err) => { this.emit("error", err); };
	}

	async connect(): Promise<void> { this._reconnector.reset(); return this._doConnect(); }
	private async _doConnect(): Promise<void> {
		this._connection.rejectOnError = this._reconnector.reconnectAttempt === 0;
		await this._connection.connect();
	}
	sendHeartbeat(currentLoad: number): void { this._heartbeat.sendHeartbeat(currentLoad); }
	send(data: SchedulerOutgoingMessage | WorkerIncomingMessage): void { this._connection.send(data); }
	disconnect(): void {
		this._reconnector.markIntentionalClose();
		this._reconnector.cancel();
		this._heartbeat.stop();
		this._connection.disconnect();
	}
	get isConnected(): boolean { return this._connection.isConnected; }
	get workerId(): string { return this._cfg.workerId; }
}
