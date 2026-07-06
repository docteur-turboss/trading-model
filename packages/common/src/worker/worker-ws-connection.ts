import WebSocket from "ws";

import type {
	SchedulerOutgoingMessage,
	WorkerIncomingMessage,
	WorkerWsRegisterMessage,
} from "../contracts/worker-protocol.types";
import { type IPAddress, type Port, toInstanceId } from "../domain/primitives";

export interface WorkerWsConnectionConfig {
	workerId: string;
	serverUrl: string;
	capabilities: string[];
	maxConcurrency: number;
}

export class WorkerWsConnection {
	private _ws!: WebSocket;
	rejectOnError = true;
	onOpen?: () => void;
	onMessage?: (data: WebSocket.Data) => void;
	onClose?: () => void;
	onError?: (err: Error) => void;

	constructor(private readonly _cfg: WorkerWsConnectionConfig) {}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this._ws = new WebSocket(this._cfg.serverUrl);
			this._ws.on("open", () => {
				this._sendRegister();
				this.onOpen?.();
				resolve();
			});
			this._ws.on("message", (data: WebSocket.Data) => {
				this.onMessage?.(data);
			});
			this._ws.on("close", () => {
				this.onClose?.();
			});
			this._ws.on("error", (err) => {
				this.onError?.(err);
				if (this.rejectOnError) {
					reject(err);
				}
			});
		});
	}

	send(data: SchedulerOutgoingMessage | WorkerIncomingMessage): void {
		if (this._ws.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify(data));
		}
	}

	disconnect(): void {
		this._ws.close();
	}

	get isConnected(): boolean {
		return this._ws.readyState === WebSocket.OPEN;
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
