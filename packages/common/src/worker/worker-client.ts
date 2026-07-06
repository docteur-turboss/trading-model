/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
import { EventEmitter } from "node:events";

import WebSocket from "ws";

import type {
	SchedulerOutgoingMessage,
	SchedulerWsJobAssignedMessage,
	WorkerIncomingMessage,
	WorkerWsHeartbeatMessage,
	WorkerWsRegisterMessage,
} from "../contracts/worker-protocol.types";
import type { IPAddress, Port } from "../domain/primitives";
import { WorkerHeartbeat } from "./worker-heartbeat";
import { WorkerReconnector } from "./worker-reconnector";

export interface WorkerClientConfig {
	workerId: string;
	serverUrl: string;
	capabilities: string[];
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
	config: WorkerClientConfig,
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

export class WorkerClient extends EventEmitter {
	on<Event extends keyof WorkerClientEvents>(
		event: Event,
		listener: (...args: WorkerClientEvents[Event]) => void,
	): this {
		return super.on(event, listener as (...args: unknown[]) => void);
	}

	emit<Event extends keyof WorkerClientEvents>(
		event: Event,
		...args: WorkerClientEvents[Event]
	): boolean {
		return super.emit(event, ...args);
	}

	private _ws: WebSocket | null = null;
	private readonly _cfg: Required<WorkerClientConfig>;
	private readonly _reconnector: WorkerReconnector;
	private readonly _heartbeat: WorkerHeartbeat;

	constructor(config: WorkerClientConfig) {
		super();
		this._cfg = normalizeConfig(config);
		this._reconnector = new WorkerReconnector(
			{
				reconnectBaseDelayMs: this._cfg.reconnectBaseDelayMs,
				reconnectMaxDelayMs: this._cfg.reconnectMaxDelayMs,
			},
			() => this._doConnect(),
			(info) => this.emit("reconnecting", info),
		);
		this._heartbeat = new WorkerHeartbeat(
			this._cfg.workerId,
			(msg: WorkerWsHeartbeatMessage) => this.send(msg),
			this._cfg.heartbeatIntervalMs,
		);
		this._messageHandlers = this._setupMessageHandlers();
	}

	async connect(): Promise<void> {
		this._reconnector.reset();
		return await this._doConnect();
	}

	private _doConnect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this._ws = new WebSocket(this._cfg.serverUrl);

			this._ws.on("open", () => this._onOpen(resolve));
			this._ws.on("message", (data: WebSocket.Data) => this._onMessage(data));
			this._ws.on("close", () => this._onClose());
			this._ws.on("error", (err) => this._onError(err, reject));
		});
	}

	private _onOpen(resolve: () => void): void {
		this._sendRegister();
		this._heartbeat.start();
		this.emit("connected");
		resolve();
	}

	private _onMessage(data: WebSocket.Data): void {
		try {
			const message: Record<string, unknown> = JSON.parse(data.toString());
			this._handleMessage(message);
		} catch (err) {
			this.emit("error", new Error(`Invalid message from server: ${err}`));
		}
	}

	private _onClose(): void {
		this._heartbeat.stop();
		this._ws = null;
		this.emit("disconnected");
		if (!this._reconnector.intentionalClose) {
			this._reconnector.scheduleReconnect();
		}
	}

	private _onError(err: Error, reject: (reason: unknown) => void): void {
		this.emit("error", err);
		if (this._reconnector.reconnectAttempt === 0) {
			reject(err);
		}
	}

	private _sendRegister(): void {
		const msg: WorkerWsRegisterMessage = {
			type: "register",
			workerId: this._cfg.workerId,
			address: "" as IPAddress,
			port: 0 as Port,
			capabilities: this._cfg.capabilities,
			maxConcurrency: this._cfg.maxConcurrency,
		};
		this.send(msg);
	}

	sendHeartbeat(currentLoad: number): void {
		this._heartbeat.sendHeartbeat(currentLoad);
	}

	private readonly _messageHandlers: Partial<
		Record<
			SchedulerOutgoingMessage["type"],
			(message: Record<string, unknown>) => void
		>
	>;

	private _setupMessageHandlers(): Partial<
		Record<
			SchedulerOutgoingMessage["type"],
			(message: Record<string, unknown>) => void
		>
	> {
		return {
			"job.assigned": (msg) =>
				this.emit(
					"job.assigned",
					(msg as unknown as SchedulerWsJobAssignedMessage).job,
				),
			"heartbeat.ack": () => this.emit("heartbeat.ack"),
			drain: () => this.emit("drain"),
		};
	}

	private _handleMessage(message: Record<string, unknown>): void {
		const handler =
			this._messageHandlers[message.type as SchedulerOutgoingMessage["type"]];
		if (handler) {
			handler(message);
		} else {
			this.emit("unknown", message);
		}
	}

	send(data: SchedulerOutgoingMessage | WorkerIncomingMessage): void {
		if (this._ws && this._ws.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify(data));
		}
	}

	disconnect(): void {
		this._reconnector.markIntentionalClose();
		this._reconnector.cancel();
		this._heartbeat.stop();
		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}
	}

	get isConnected(): boolean {
		return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
	}

	get workerId(): string {
		return this._cfg.workerId;
	}
}
