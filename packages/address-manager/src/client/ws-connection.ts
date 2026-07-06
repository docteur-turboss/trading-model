import type { IWsConnection } from "@trading-model/common/ws/i-ws-connection";
import WebSocket from "ws";

export class WsConnection implements IWsConnection {
	private _ws: WebSocket | null = null;

	onOpen?: () => void;
	onMessage?: (data: WebSocket.Data) => void;
	onError?: (err: Error) => void;
	onCloseHandler?: () => void;
	lastCloseCode?: number;

	constructor(
		private readonly _baseUrl: string,
		private _token?: string
	) {}

	private get _url(): string {
		if (!this._token) {
			return this._baseUrl;
		}
		const url = new URL(this._baseUrl);
		url.searchParams.set("token", this._token);
		return url.toString();
	}

	get url(): string {
		return this._url;
	}

	connect(): void {
		try {
			this._ws = new WebSocket(this._url);
			this._ws.on("open", () => this.onOpen?.());
			this._ws.on("message", (data: WebSocket.Data) => this.onMessage?.(data));
			this._ws.on("close", (code: number) => {
				this.lastCloseCode = code;
				this.onCloseHandler?.();
			});
			this._ws.on("error", (err: Error) => this.onError?.(err));
		} catch {
			/* connection failed */
		}
	}

	disconnect(closeCode?: number, reason?: string): void {
		if (this._ws) {
			this._ws.close(closeCode, reason);
		}
	}

	get isConnected(): boolean {
		return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
	}

	send(data: unknown): boolean {
		if (this._ws && this._ws.readyState === WebSocket.OPEN) {
			this._ws.send(typeof data === "string" ? data : JSON.stringify(data));
			return true;
		}
		return false;
	}

	updateToken(token: string): void {
		this._token = token;
	}
}
