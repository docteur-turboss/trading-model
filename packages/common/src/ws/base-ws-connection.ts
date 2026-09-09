import WebSocket from "ws";
import type { IWsConnection } from "./i-ws-connection";

export interface WsConnectionHooks {
	onOpen?: () => void;
	onMessage?: (raw: WebSocket.RawData) => void;
	onClose?: (code: number) => void;
	onError?: (err: Error) => void;
}

export abstract class BaseWsConnection implements IWsConnection {
	protected _ws: WebSocket | null = null;

	onOpen: () => void = () => {};
	onMessage: (data: unknown) => void = () => {};
	onCloseHandler: (code?: number) => void = () => {};
	onError: (err: Error) => void = () => {};

	protected attachHandlers(ws: WebSocket, hooks: WsConnectionHooks = {}): void {
		this._ws = ws;
		ws.on("open", () => {
			hooks.onOpen?.();
			this.onOpen?.();
		});
		ws.on("message", (raw: WebSocket.RawData) => {
			if (hooks.onMessage) {
				hooks.onMessage(raw);
			} else {
				this.onMessage?.(raw);
			}
		});
		ws.on("close", (code: number) => {
			hooks.onClose?.(code);
			this.onCloseHandler?.(code);
		});
		ws.on("error", (err: Error) => {
			hooks.onError?.(err);
			this.onError?.(err);
		});
	}

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
}
