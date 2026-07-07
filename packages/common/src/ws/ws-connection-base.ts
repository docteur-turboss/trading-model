import WebSocket from "ws";
import type { IWsConnection } from "./i-ws-connection";

export abstract class WsConnectionBase implements IWsConnection {
	protected _ws: WebSocket | null | undefined = null;

	onOpen: () => void = () => {};
	onMessage: (data: unknown) => void = () => {};
	onCloseHandler: () => void = () => {};
	onError: (err: Error) => void = () => {};

	abstract connect(): void | Promise<void>;

	disconnect(closeCode?: number, reason?: string): void {
		try {
			this._ws?.close(closeCode, reason);
		} catch {}
	}

	send(data: unknown): boolean {
		if (this._ws?.readyState === WebSocket.OPEN) {
			try {
				this._ws.send(
					typeof data === "string" ? data : JSON.stringify(data),
				);
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
}
