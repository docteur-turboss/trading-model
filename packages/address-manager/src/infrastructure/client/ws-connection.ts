import { URLString } from "@trading-model/common/domain/primitives";
import { BaseWsConnection } from "@trading-model/common/ws/base-ws-connection";
import WebSocket from "ws";

export class WsConnection extends BaseWsConnection {
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
			const ws = new WebSocket(this._url);
			this.attachHandlers(ws);
		} catch {}
	}

	updateToken(token: string): void {
		this._token = token;
	}
}
