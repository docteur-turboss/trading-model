import type {
	SchedulerOutgoingMessage,
	SchedulerWsJobAssignedMessage,
	WorkerIncomingMessage,
} from "@trading-model/validation/contracts/worker-protocol.types";
import type { Capability, DurationMs, PositiveInt } from "../domain/primitives";
import type { BackoffConfig } from "../utils/backoff-config";
import type { DefaultWsReconnector } from "../ws/default-ws-reconnector";
import { wireConnectionEvents } from "./connection-wire";
import { TypedEventEmitter } from "./typed-event-emitter";
import {
	buildConnection,
	buildHeartbeat,
	buildReconnector,
	type NormalizedConfig,
	normalizeConfig,
} from "./worker-client-factory";
import type { WorkerHeartbeat } from "./worker-heartbeat";
import { WorkerMessageRouter } from "./worker-message-router";
import type { WorkerWsConnection } from "./worker-ws-connection";

export interface WorkerClientConfig {
	workerId: string;
	serverUrl: string;
	capabilities: Capability[];
	maxConcurrency: PositiveInt;
	heartbeatIntervalMs?: DurationMs;
	reconnectConfig?: BackoffConfig;
}
export interface WorkerClientEvents {
	connected: [];
	disconnected: [];
	"heartbeat.ack": [];
	drain: [];
	"job.assigned": [job: SchedulerWsJobAssignedMessage["job"]];
	reconnecting: [info: { attempt: number; delay: number }];
	error: [error: Error];
	unknown: [message: unknown];
}

export class WorkerClient extends TypedEventEmitter<WorkerClientEvents> {
	private readonly _cfg: NormalizedConfig;
	private readonly _connection: WorkerWsConnection;
	private readonly _reconnector: DefaultWsReconnector;
	private readonly _heartbeat: WorkerHeartbeat;
	private readonly _messageRouter: WorkerMessageRouter;

	constructor(config: WorkerClientConfig) {
		super();
		this._cfg = normalizeConfig(config);
		this._connection = buildConnection(this._cfg);
		this._reconnector = buildReconnector(
			this._cfg,
			() => this._doConnect(),
			(info) => this.emit("reconnecting", info)
		);
		this._heartbeat = buildHeartbeat(this._cfg, (msg) => this.send(msg));
		this._messageRouter = new WorkerMessageRouter(this.raw);
		wireConnectionEvents(this._connection, {
			heartbeat: this._heartbeat,
			reconnector: this._reconnector,
			messageRouter: this._messageRouter,
			emitter: this,
		});
	}

	connect(): Promise<void> {
		this._reconnector.reset();
		return this._doConnect();
	}
	private async _doConnect(): Promise<void> {
		this._connection.rejectOnError = this._reconnector.reconnectAttempt === 0;
		await this._connection.connect();
	}
	sendHeartbeat(currentLoad: number): void {
		this._heartbeat.sendHeartbeat(currentLoad);
	}
	send(data: SchedulerOutgoingMessage | WorkerIncomingMessage): void {
		this._connection.send(data);
	}
	disconnect(): void {
		this._reconnector.markIntentionalClose();
		this._reconnector.cancel();
		this._heartbeat.stop();
		this._connection.disconnect();
	}
	get isConnected(): boolean {
		return this._connection.isConnected;
	}
	get workerId(): string {
		return this._cfg.workerId;
	}
}
