import WebSocket from "ws";
import type { WorkerWsRegisterMessage } from "../contracts/worker-protocol.types";
import type { Capability } from "../domain/primitives";
import { type IPAddress, type Port, toInstanceId } from "../domain/primitives";
import type { IWsConnection } from "../ws/i-ws-connection";

export interface WorkerWsConnectionConfig {
	workerId: string;
	serverUrl: string;
	capabilities: Capability[];
	maxConcurrency: number;
}

export class WorkerWsConnection implements IWsConnection {
	private _ws: WebSocket | null = null;
	rejectOnError = true;
	onOpen: () => void = () => {};
	onMessage: (data: unknown) => void = () => {};
	onClose: () => void = () => {};
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
			this.onClose?.();
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
			workerId: toInstanceId(this._cfg.workerId),
			address: "" as IPAddress,
			port: 0 as Port,
			capabilities: this._cfg.capabilities,
			maxConcurrency: this._cfg.maxConcurrency,
		};
		this.send(msg);
	}
}
