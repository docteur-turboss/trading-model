import * as https from "node:https";
import { buildHttpsAgentOptions } from "@trading-model/common/config/http-tls-loader";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { BaseWsConnection } from "@trading-model/common/ws/base-ws-connection";
import WebSocket from "ws";

export interface WssConnectionEvents {
	onClose: (code: number, reason: Buffer) => void;
	onOpen: () => void;
	onMessage: (data: string) => void;
	onError: (err: Error) => void;
}

export class WssConnection extends BaseWsConnection {
	private _wsUrl?: string;
	private readonly _agent?: https.Agent;

	constructor(tlsConfig?: Partial<TlsPaths>) {
		super();
		const opts =
			tlsConfig?.caPath && tlsConfig?.certPath && tlsConfig?.keyPath
				? buildHttpsAgentOptions(tlsConfig as TlsPaths)
				: undefined;
		if (opts) {
			this._agent = new https.Agent(opts);
		}
	}

	setUrl(wsUrl: string): void {
		this._wsUrl = wsUrl;
	}

	connect(): void {
		const url = this._wsUrl;
		if (!url) {
			return;
		}
		this._ws?.close();
		this._ws = new WebSocket(url, { agent: this._agent });
		this._ws.on("open", () => {
			this.onOpen?.();
		});
		this._ws.on("message", (raw: WebSocket.RawData) => {
			this.onMessage?.(raw.toString());
		});
		this._ws.on("close", () => {
			this.onCloseHandler?.();
		});
		this._ws.on("error", (err: Error) => {
			try {
				this._ws?.close();
			} catch {}
			this.onError?.(err);
		});
	}
}
