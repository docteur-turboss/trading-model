import * as https from "node:https";
import type { Buffer as NodeBuffer } from "node:buffer";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { buildHttpsAgentOptions } from "@trading-model/common/config/http-tls-loader";
import type { IWsConnection } from "@trading-model/common/ws/i-ws-connection";
import WebSocket from "ws";

export interface WssConnectionEvents {
	onClose: (code: number, reason: Buffer) => void;
	onOpen: () => void;
	onMessage: (data: string) => void;
	onError: (err: Error) => void;
}

export class WssConnection implements IWsConnection {
	private _ws: WebSocket | undefined;
	private _wsUrl?: string;
	private _lastCloseCode = 0;
	private _lastCloseReason = Buffer.alloc(0) as NodeBuffer;
	private readonly _agent?: https.Agent;
	onCloseHandler?: () => void;
	onOpen?: () => void;
	onMessage?: (data: unknown) => void;
	onError?: (err: Error) => void;

	constructor(tlsConfig?: Partial<TlsPaths>) {
		const opts = tlsConfig?.caPath && tlsConfig?.certPath && tlsConfig?.keyPath
			? buildHttpsAgentOptions(tlsConfig as TlsPaths)
			: undefined;
		if (opts) {
			this._agent = new https.Agent(opts);
		}
	}

	connect(wsUrl?: string): void {
		const url = wsUrl ?? this._wsUrl;
		if (!url) return;
		this._wsUrl = url;
		try { this._ws?.close(); } catch {}
		this._ws = new WebSocket(url, { agent: this._agent });
		this._ws.on("open", () => { this.onOpen?.(); });
		this._ws.on("message", (raw: WebSocket.RawData) => { this.onMessage?.(raw.toString()); });
		this._ws.on("close", (code: number, reason) => { this._lastCloseCode = code; this._lastCloseReason = reason as unknown as Buffer; this.onCloseHandler?.(); });
		this._ws.on("error", (err: Error) => { try { this._ws?.close(); } catch {} this.onError?.(err); });
	}

	disconnect(closeCode?: number, reason?: string): void { try { this._ws?.close(closeCode, reason); } catch {} }
	send(data: unknown): boolean {
		if (this._ws?.readyState !== WebSocket.OPEN) return false;
		try { this._ws.send(JSON.stringify(data)); return true; } catch { return false; }
	}
	get isConnected(): boolean { return this._ws?.readyState === WebSocket.OPEN; }
	get ws(): WebSocket | undefined { return this._ws; }
}
