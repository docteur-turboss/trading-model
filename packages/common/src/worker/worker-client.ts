import type {
	SchedulerOutgoingMessage,
	SchedulerWsJobAssignedMessage,
	WorkerIncomingMessage,
	WorkerWsHeartbeatMessage,
} from "../contracts/worker-protocol.types";
import type { Capability, JobType } from "../domain/primitives";
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

function normalizeConfig(
	config: WorkerClientConfig
): Required<WorkerClientConfig> {
	return {
		workerId: config.workerId,
		serverUrl: config.serverUrl,
		capabilities: config.capabilities,
		maxConcurrency: config.maxConcurrency,
		heartbeatIntervalMs: config.heartbeatIntervalMs ?? 15000,
		reconnectBaseDelayMs: config.reconnectBaseDelayMs ?? 1000,
		reconnectMaxDelayMs: config.reconnectMaxDelayMs ?? 30000,
	};
}

export class WorkerClient {
	private readonly _events = new TypedEventEmitter<WorkerClientEvents>();

	on<Event extends keyof WorkerClientEvents>(
		event: Event,
		listener: (...args: WorkerClientEvents[Event]) => void
	): this {
		this._events.on(event, listener);
		return this;
	}

	off<Event extends keyof WorkerClientEvents>(
		event: Event,
		listener: (...args: WorkerClientEvents[Event]) => void
	): this {
		this._events.off(event, listener);
		return this;
	}

	emit<Event extends keyof WorkerClientEvents>(
		event: Event,
		...args: WorkerClientEvents[Event]
	): boolean {
		return this._events.emit(event, ...args);
	}

	private readonly _cfg: Required<WorkerClientConfig>;
	private readonly _connection: WorkerWsConnection;
	private readonly _reconnector: DefaultWsReconnector;
	private readonly _heartbeat: WorkerHeartbeat;
	private readonly _messageRouter: WorkerMessageRouter;

	constructor(config: WorkerClientConfig) {
		this._cfg = normalizeConfig(config);
		this._connection = this._createConnection();
		this._reconnector = this._createReconnector();
		this._heartbeat = this._createHeartbeat();
		this._messageRouter = new WorkerMessageRouter(this._events.raw);
		this._wireConnectionEvents();
	}

	private _createConnection(): WorkerWsConnection {
		return new WorkerWsConnection({
			workerId: this._cfg.workerId,
			serverUrl: this._cfg.serverUrl,
			capabilities: this._cfg.capabilities,
			maxConcurrency: this._cfg.maxConcurrency,
		});
	}

	private _createReconnector(): DefaultWsReconnector {
		return new DefaultWsReconnector({
			config: {
				baseDelayMs: this._cfg.reconnectBaseDelayMs,
				maxDelayMs: this._cfg.reconnectMaxDelayMs,
			},
			onReconnect: () => this._doConnect(),
			onSchedule: (info) => this.emit("reconnecting", info),
		});
	}

	private _createHeartbeat(): WorkerHeartbeat {
		return new WorkerHeartbeat(
			this._cfg.workerId,
			(msg: WorkerWsHeartbeatMessage) => this.send(msg),
			this._cfg.heartbeatIntervalMs
		);
	}

	private _handleOpen(): void {
		this._heartbeat.start();
		this.emit("connected");
	}

	private _handleClose(): void {
		this._heartbeat.stop();
		this.emit("disconnected");
		if (!this._reconnector.intentionalClose) {
			this._reconnector.scheduleReconnect();
		}
	}

	private _handleMessage(data: unknown): void {
		try {
			const message: Record<string, unknown> = JSON.parse(String(data));
			this._messageRouter.handle(message, (msg) => this.emit("unknown", msg));
		} catch (err) {
			this.emit("error", new Error(`Invalid message from server: ${err}`));
		}
	}

	private _handleError(err: Error): void {
		this.emit("error", err);
	}

	private _wireConnectionEvents(): void {
		this._connection.onOpen = () => this._handleOpen();
		this._connection.onClose = () => this._handleClose();
		this._connection.onMessage = (data) => this._handleMessage(data);
		this._connection.onError = (err) => this._handleError(err);
	}

	async connect(): Promise<void> {
		this._reconnector.reset();
		return await this._doConnect();
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
