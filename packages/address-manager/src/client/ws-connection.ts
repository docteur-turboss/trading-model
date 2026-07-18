import { URLString } from "@trading-model/common/domain/primitives";
import { BaseWsConnection } from "@trading-model/common/ws/base-ws-connection";
import WebSocket from "ws";

export class WsConnection extends BaseWsConnection {
	lastCloseCode?: number;

	constructor(
		private readonly _baseUrl: URLString,
		private _token?: string
	) {
		super();
	}

	private get _url(): URLString {
		if (!this._token) {
			return this._baseUrl;
		}
		const url = new URL(this._baseUrl);
		url.searchParams.set("token", this._token);
		return URLString.of(url.toString());
	}

	get url(): URLString {
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
		} catch {}
	}

	updateToken(token: string): void {
		this._token = token;
	}
}
