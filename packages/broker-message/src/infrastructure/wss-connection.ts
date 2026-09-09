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
	private readonly _wsUrl: string;
	private readonly _agent?: https.Agent;

	constructor(wsUrl: string, tlsConfig?: Partial<TlsPaths>) {
		super();
		this._wsUrl = wsUrl;
		const opts =
			tlsConfig?.caPath && tlsConfig?.certPath && tlsConfig?.keyPath
				? buildHttpsAgentOptions(tlsConfig as TlsPaths)
				: undefined;
		if (opts) {
			this._agent = new https.Agent(opts);
		}
	}

	connect(): void {
		this._ws?.close();
		const ws = new WebSocket(this._wsUrl, { agent: this._agent });
		this.attachHandlers(ws, {
			onMessage: (raw) => {
				this.onMessage?.(raw.toString());
			},
			onError: () => {
				try {
					this._ws?.close();
				} catch {}
			},
		});
	}
}
