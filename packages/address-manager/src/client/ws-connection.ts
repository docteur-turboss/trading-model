import WebSocket from "ws";

export class WsConnection {
	private _ws!: WebSocket;

	constructor(
		private readonly _baseUrl: string,
		private _token?: string,
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

	connect(): WebSocket | null {
		try {
			this._ws = new WebSocket(this._url);
			return this._ws;
		} catch {
			this._ws = null;
			return null;
		}
	}

	disconnect(): void {
		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}
	}

	get isConnected(): boolean {
		return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
	}

	send(data: string): boolean {
		if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
			return false;
		}
		this._ws.send(data);
		return true;
	}

	updateToken(token: string): void {
		this._token = token;
	}

	onClose(): void {
		this._ws = null;
	}
}
