import type { SchedulerOutgoingMessage, SchedulerWsJobAssignedMessage, WorkerIncomingMessage, WorkerWsHeartbeatMessage } from "../contracts/worker-protocol.types";
import type { Capability } from "../domain/primitives";
import { DefaultWsReconnector } from "../ws/default-ws-reconnector";
import { TypedEventEmitter } from "./typed-event-emitter";
import { wireConnectionEvents } from "./connection-wire";
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

function _buildConnection(cfg: Required<WorkerClientConfig>): WorkerWsConnection {
	return new WorkerWsConnection({
		workerId: cfg.workerId,
		serverUrl: cfg.serverUrl,
		capabilities: cfg.capabilities,
		maxConcurrency: cfg.maxConcurrency,
	});
}

function _buildReconnector(
	cfg: Required<WorkerClientConfig>,
	onReconnect: () => Promise<void>,
	onSchedule: (info: { attempt: number; delay: number }) => void
): DefaultWsReconnector {
	return new DefaultWsReconnector({
		config: {
			baseDelayMs: cfg.reconnectBaseDelayMs,
			maxDelayMs: cfg.reconnectMaxDelayMs,
		},
		onReconnect,
		onSchedule,
	});
}

function _buildHeartbeat(
	cfg: Required<WorkerClientConfig>,
	send: (msg: WorkerWsHeartbeatMessage) => void
): WorkerHeartbeat {
	return new WorkerHeartbeat(
		cfg.workerId,
		(msg: WorkerWsHeartbeatMessage) => send(msg),
		cfg.heartbeatIntervalMs
	);
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
		this._connection = _buildConnection(this._cfg);
		this._reconnector = _buildReconnector(this._cfg, () => this._doConnect(), (info) => this.emit("reconnecting", info));
		this._heartbeat = _buildHeartbeat(this._cfg, (msg) => this.send(msg));
		this._messageRouter = new WorkerMessageRouter(this.raw);
		wireConnectionEvents(this._connection, this._heartbeat, this._reconnector, this._messageRouter, this);
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
