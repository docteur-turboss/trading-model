import WebSocket from "ws";
import type { IWsConnection } from "./i-ws-connection";

export abstract class BaseWsConnection implements IWsConnection {
	protected _ws: WebSocket | null = null;

	onOpen: () => void = () => {};
	onMessage: (data: unknown) => void = () => {};
	onCloseHandler: () => void = () => {};
	onError: (err: Error) => void = () => {};

	abstract connect(): void;

	get ws(): WebSocket | null {
		return this._ws;
	}

	disconnect(closeCode?: number, reason?: string): void {
		try {
			this._ws?.removeAllListeners();
		} catch {}
		try {
			this._ws?.close(closeCode, reason);
		} catch {}
	}

	send(data: unknown): boolean {
		if (this._ws?.readyState === WebSocket.OPEN) {
			try {
				this._ws.send(typeof data === "string" ? data : JSON.stringify(data));
				return true;
			} catch {
				return false;
			}
		}
		return false;
	}

	get isConnected(): boolean {
		try {
			return this._ws?.readyState === WebSocket.OPEN;
		} catch {
			return false;
		}
	}

	on(event: string, listener: (...args: unknown[]) => void): this {
		switch (event) {
			case "open":
				this.onOpen = listener as () => void;
				break;
			case "message":
				this.onMessage = listener as (data: unknown) => void;
				break;
			case "close":
				this.onCloseHandler = listener as () => void;
				break;
			case "error":
				this.onError = listener as (err: Error) => void;
				break;
			default:
				break;
		}
		return this;
	}
}
