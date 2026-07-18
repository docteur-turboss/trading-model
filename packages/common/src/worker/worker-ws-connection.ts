import WebSocket from "ws";
import type { WorkerWsRegisterMessage } from "../contracts/worker-protocol-types";
import {
	type Capability,
	type InstanceId,
	IPAddress,
	Port,
	type PositiveInt,
	type URLString,
} from "../domain/primitives";
import type { IWsConnection } from "../ws/i-ws-connection";

export interface WorkerWsConnectionConfig {
	workerId: InstanceId;
	serverUrl: URLString;
	capabilities: Capability[];
	maxConcurrency: PositiveInt;
}

export class WorkerWsConnection implements IWsConnection {
	private _ws: WebSocket | null = null;
	rejectOnError = true;
	onOpen: () => void = () => {};
	onMessage: (data: unknown) => void = () => {};
	onError: (err: Error) => void = () => {};

	onCloseHandler: () => void = () => {};

	constructor(private readonly _cfg: WorkerWsConnectionConfig) {}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(this._cfg.serverUrl);
			this._ws = ws;
			this._setupWsHandlers(ws, resolve, reject);
		});
	}

	private _setupWsHandlers(
		ws: WebSocket,
		resolve: () => void,
		reject: (err: Error) => void
	): void {
		ws.on("open", () => {
			this._sendRegister();
			this.onOpen?.();
			resolve();
		});
		ws.on("message", (data: WebSocket.Data) => {
			this.onMessage?.(data);
		});
		ws.on("close", () => {
			this.onCloseHandler?.();
		});
		ws.on("error", (err) => {
			this.onError?.(err);
			if (this.rejectOnError) {
				reject(err);
			}
		});
	}

	send(data: unknown): boolean {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify(data));
			return true;
		}
		return false;
	}

	disconnect(closeCode?: number, reason?: string): void {
		this._ws?.close(closeCode, reason);
	}

	get isConnected(): boolean {
		return this._ws?.readyState === WebSocket.OPEN;
	}

	private _sendRegister(): void {
		const msg: WorkerWsRegisterMessage = {
			type: "register",
			workerId: this._cfg.workerId,
			host: IPAddress.of(""),
			port: Port.of(0),
			capabilities: this._cfg.capabilities,
			maxConcurrency: this._cfg.maxConcurrency,
		};
		this.send(msg);
	}
}
