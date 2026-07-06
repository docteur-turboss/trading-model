import * as fs from "node:fs";
import * as https from "node:https";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type { IWsConnection } from "@trading-model/common/ws/i-ws-connection";
import WebSocket from "ws";

export interface WssConnectionEvents {
	onOpen: () => void;
	onMessage: (raw: string) => void;
	onClose: (code: number, reason: Buffer) => void;
	onError: (err: Error) => void;
}

export class WssConnection implements IWsConnection {
	private _ws: WebSocket | undefined;
	private readonly _tlsCa?: string;
	private readonly _tlsCert?: string;
	private readonly _tlsKey?: string;
	private _lastUrl?: string;
	private _lastEvents?: WssConnectionEvents;

	onCloseHandler?: () => void;

	constructor(tlsConfig?: Partial<TlsPaths>) {
		this._tlsCa = tlsConfig?.caPath
			? fs.readFileSync(tlsConfig.caPath, "utf8")
			: undefined;
		this._tlsCert = tlsConfig?.certPath
			? fs.readFileSync(tlsConfig.certPath, "utf8")
			: undefined;
		this._tlsKey = tlsConfig?.keyPath
			? fs.readFileSync(tlsConfig.keyPath, "utf8")
			: undefined;
	}

	connect(wsUrl: string, events: WssConnectionEvents): void;
	connect(): void;
	connect(wsUrl?: string, events?: WssConnectionEvents): void {
		const url = wsUrl ?? this._lastUrl;
		const evts = events ?? this._lastEvents;
		if (!(url && evts)) {
			return;
		}
		this._lastUrl = url;
		this._lastEvents = evts;

		try {
			this._ws?.close();
		} catch {
			/* ignore */
		}

		const agent = this._setupWsTls();
		this._ws = new WebSocket(url, { agent });

		this._ws.on("open", () => {
			evts.onOpen();
		});
		this._ws.on("message", (raw: WebSocket.RawData) => {
			evts.onMessage(raw.toString());
		});
		this._ws.on("close", (code: number, reason: Buffer) => {
			evts.onClose(code, reason);
			this.onCloseHandler?.();
		});
		this._ws.on("error", (err: Error) => {
			try {
				this._ws?.close();
			} catch {
				/* ignore */
			}
			evts.onError(err);
		});
	}

	disconnect(closeCode?: number, reason?: string): void {
		try {
			this._ws?.close(closeCode, reason);
		} catch {
			/* ignore */
		}
	}

	send(data: unknown): boolean {
		if (this._ws?.readyState !== WebSocket.OPEN) {
			return false;
		}
		try {
			this._ws.send(JSON.stringify(data));
			return true;
		} catch {
			return false;
		}
	}

	get isConnected(): boolean {
		return this._ws?.readyState === WebSocket.OPEN;
	}

	get ws(): WebSocket | undefined {
		return this._ws;
	}

	private _setupWsTls(): https.Agent | undefined {
		if (!this._tlsCa) {
			return;
		}
		return new https.Agent({
			ca: this._tlsCa,
			cert: this._tlsCert,
			key: this._tlsKey,
		});
	}
}
